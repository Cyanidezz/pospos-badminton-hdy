// LINE messages for stringing job updates: a Flex card, plus a plain-text fallback.
// Pure functions (no database or env access) so the card layout is easy to check.

const BLUE = "#3A70D4";
const NAVY = "#24406F";
const MUTED = "#7C8AA5";
const TRACK = "#E3E8F2";

const statusStyle: Record<string, { color: string; note: string }> = {
  "รอขึ้นเอ็น": { color: "#E39A1F", note: "รับไม้ไว้แล้ว รอคิวขึ้นเอ็น" },
  "กำลังขึ้นเอ็น": { color: BLUE, note: "ช่างกำลังขึ้นเอ็นให้ไม้ของคุณ" },
  "พร้อมรับไม้": { color: "#22A06B", note: "ไม้พร้อมแล้ว มารับได้ที่ร้านเลย" },
  "คืนไม้แล้ว": { color: "#6B7A99", note: "ขอบคุณที่ใช้บริการ" },
  "ยกเลิก": { color: "#CF4A44", note: "งานนี้ถูกยกเลิก หากมีข้อสงสัยกรุณาติดต่อร้าน" },
};

type Job = { id: string; token?: string; racket: string; status: string; paid: number; amount: number };
type Options = { steps: readonly string[]; siteUrl?: string };

const baht = (satang: number) => (satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jobNumber = (job: Job) => job.id.slice(0, 8).toUpperCase();

const text = (value: string, extra: Record<string, unknown> = {}) => ({ type: "text", text: value, wrap: true, ...extra });
const row = (label: string, value: string, valueColor = NAVY) => ({
  type: "box",
  layout: "horizontal",
  spacing: "sm",
  contents: [
    text(label, { size: "sm", color: MUTED, flex: 3 }),
    text(value, { size: "sm", color: valueColor, weight: "bold", align: "end", flex: 5 }),
  ],
});

export function jobStatusMessage(job: Job, { steps, siteUrl = "" }: Options) {
  const style = statusStyle[job.status] ?? statusStyle["รอขึ้นเอ็น"];
  const step = steps.indexOf(job.status);
  const cancelled = job.status === "ยกเลิก";
  const trackUrl = /^https:\/\//.test(siteUrl) && job.token ? `${siteUrl.replace(/\/$/, "")}/track/${job.token}` : "";

  const progress = cancelled || step < 0 ? [] : [
    {
      type: "box",
      layout: "horizontal",
      spacing: "xs",
      margin: "md",
      contents: steps.map((_, index) => ({
        type: "box",
        layout: "vertical",
        flex: 1,
        height: "6px",
        cornerRadius: "3px",
        backgroundColor: index <= step ? style.color : TRACK,
        contents: [{ type: "filler" }],
      })),
    },
    text(`ขั้นตอนที่ ${step + 1} จาก ${steps.length}`, { size: "xs", color: MUTED }),
  ];

  const details = [
    row("เลขรับไม้", `#${jobNumber(job)}`),
    ...(cancelled ? [] : [job.paid ? row("การชำระเงิน", "ชำระแล้ว", "#22A06B") : row("การชำระเงิน", `รอชำระ ฿${baht(job.amount)}`, "#E39A1F")]),
  ];

  return {
    type: "flex",
    altText: `สถานะไม้ ${job.racket}: ${job.status}`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: BLUE,
        paddingAll: "18px",
        spacing: "xs",
        contents: [
          text("WINGPRO BADMINTON", { size: "xs", color: "#DCE7FB", weight: "bold" }),
          text("สถานะงานขึ้นเอ็น", { size: "lg", color: "#FFFFFF", weight: "bold" }),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "md",
        contents: [
          text(job.racket, { size: "lg", weight: "bold", color: NAVY }),
          text(job.status, { size: "xl", weight: "bold", color: style.color }),
          text(style.note, { size: "sm", color: MUTED }),
          ...progress,
          { type: "separator", margin: "lg" },
          { type: "box", layout: "vertical", spacing: "sm", margin: "lg", contents: details },
        ],
      },
      ...(trackUrl ? {
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "14px",
          contents: [{ type: "button", style: "primary", color: BLUE, height: "sm", action: { type: "uri", label: "ดูสถานะของไม้", uri: trackUrl } }],
        },
      } : {}),
    },
  };
}

// Plain text used if LINE ever rejects the Flex card, so the customer still hears about the update.
export function jobStatusText(job: Job) {
  return {
    type: "text",
    text: `สถานะไม้ ${job.racket}: ${job.status}\nเลขรับไม้ ${jobNumber(job)}${job.paid ? "\nชำระเงินแล้ว" : `\nยอดชำระ ${baht(job.amount)} บาท`}`,
  };
}

// ---------------------------------------------------------------- rich menu replies

// A carousel of Flex bubbles (LINE allows up to 12), or null when there are none.
const carousel = (altText: string, bubbles: any[]) => bubbles.length ? { type: "flex", altText: altText.slice(0, 400), contents: { type: "carousel", contents: bubbles.slice(0, 12) } } : null;

type TrackJob = Job & { created?: string; line_user?: string | null };

// "ติดตามงานขึ้นเอ็น": the customer's jobs still in the shop. A job already linked to THIS LINE account gets the full
// card (payment + tracking link), same as a status push. One only found by typing a phone number gets a short card:
// racket, status and date - anyone can type any number, so nothing about payment or the private tracking link.
export function trackJobsMessage(jobs: TrackJob[], { steps, siteUrl = "", lineUser = "" }: Options & { lineUser?: string }) {
  const bubbles = jobs.map(job => {
    if (lineUser && job.line_user === lineUser) return jobStatusMessage(job, { steps, siteUrl }).contents;
    const style = statusStyle[job.status] ?? statusStyle["รอขึ้นเอ็น"];
    const received = job.created ? new Date(job.created).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }) : "";
    return {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "sm",
        contents: [
          text("WINGPRO BADMINTON", { size: "xxs", color: MUTED, weight: "bold" }),
          text(job.racket, { size: "md", weight: "bold", color: NAVY }),
          text(job.status, { size: "lg", weight: "bold", color: style.color }),
          text(style.note, { size: "xs", color: MUTED }),
          { type: "separator", margin: "md" },
          row("เลขรับไม้", `#${jobNumber(job)}`),
          ...(received ? [row("รับไม้", received)] : []),
        ],
      },
    };
  });
  return carousel(`งานขึ้นเอ็นของคุณ ${jobs.length} รายการ`, bubbles);
}

type Promotion = { id: string; title: string; body: string; image?: string | null };

// "โปรโมชั่น": one card per active promotion, image on top (served publicly by /api/line/promo-image/[id]).
export function promotionsMessage(promotions: Promotion[], { siteUrl = "", phone = "" }: { siteUrl?: string; phone?: string } = {}) {
  const base = /^https:\/\//.test(siteUrl) ? siteUrl.replace(/\/$/, "") : "";
  const tel = String(phone).replace(/[^0-9+]/g, "");
  const bubbles = promotions.map(promo => ({
    type: "bubble",
    size: "mega",
    ...(base && promo.image ? { hero: { type: "image", url: `${base}/api/line/promo-image/${promo.image}`, size: "full", aspectRatio: "20:13", aspectMode: "cover" } } : {}),
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "sm",
      contents: [
        text("โปรโมชั่น", { size: "xs", color: "#E0801A", weight: "bold" }),
        text(promo.title, { size: "lg", weight: "bold", color: NAVY }),
        ...(promo.body ? [text(promo.body, { size: "sm", color: "#4B5A75" })] : []),
      ],
    },
    ...(tel ? {
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        contents: [{ type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "โทรสอบถามร้าน", uri: `tel:${tel}` } }],
      },
    } : {}),
  }));
  return carousel(`โปรโมชั่น Wingpro Badminton (${promotions.length})`, bubbles);
}

type Member = {
  stars: number; stringNeed: number; socksNeed: number; stringAvailable: boolean; socksAvailable: boolean;
  stringUsed: number; socksUsed: number; rewardCap: number | null; socksProductName: string | null; posMinAmount?: number;
  promo?: { phase: string | null; start: string | null; end: string | null };
};

const PURPLE = "#6D3FD6";
const thaiDay = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

// Same wording as the tracking page's stamp card, so the two never tell a customer different things.
export function promoNote(promo: Member["promo"]) {
  if (!promo?.phase) return "";
  const { phase, start, end } = promo;
  if (phase === "off") return "ปิดรับสะสมแต้มชั่วคราว · แต้มและสิทธิ์ที่มีอยู่ยังใช้ได้ตามปกติ";
  if (phase === "before") return end ? `โปรโมชั่นสะสมแต้ม ${thaiDay(start!)} – ${thaiDay(end)}` : `โปรโมชั่นสะสมแต้มเริ่ม ${thaiDay(start!)}`;
  if (phase === "after") return `โปรโมชั่นสะสมแต้มสิ้นสุดแล้วเมื่อ ${thaiDay(end!)} · แต้มและสิทธิ์ที่มีอยู่ยังใช้ได้ตามปกติ`;
  if (end) return `สะสมแต้มได้ถึง ${thaiDay(end)}`;
  if (start) return `สะสมแต้มได้ตั้งแต่ ${thaiDay(start)} เป็นต้นไป`;
  return "";
}

// "เช็คคะแนนสะสม": stars so far as a stamp grid (rows of 5, the socks milestone marked), and what each reward still
// needs. A customer with no stars yet (or a phone the shop doesn't know - member null) gets the programme card
// instead: how to earn, what each reward is, and the stamping period - all from the shop's member settings.
// trackUrl (the customer's own open job) is only passed for a LINE account already linked to that job - someone
// who just typed a phone number sees the numbers, never a link into another person's job.
// Only standard Flex properties: LINE rejects the WHOLE reply over one unknown property (no error reaches the chat).
export function memberCardMessage(member: Member, { trackUrl = "", known = true, holder = "" }: { trackUrl?: string; known?: boolean; holder?: string } = {}) {
  const need = Math.max(1, member.stringNeed);
  const fresh = !known || member.stars <= 0;
  const socksAt = member.socksProductName ? member.socksNeed : 0;
  const stamp = (i: number) => {
    const filled = i < member.stars, milestone = i + 1 === socksAt || i + 1 === need;
    return text(filled ? "★" : milestone ? (i + 1 === need ? "🎁" : "🧦") : "☆", { size: "xl", align: "center", color: filled ? PURPLE : milestone ? "#E0801A" : "#C9CFDD", flex: 1 });
  };
  const grid = need <= 20 ? Array.from({ length: Math.ceil(need / 5) }, (_, row) => ({
    type: "box", layout: "horizontal",
    contents: Array.from({ length: 5 }, (_, col) => row * 5 + col).map(i => i < need ? stamp(i) : { type: "box", layout: "vertical", flex: 1, contents: [] }),
  })) : [];
  const cap = member.rewardCap === null || member.rewardCap === undefined ? "ฟรีค่าขึ้นเอ็นทั้งหมด" : `เอ็นมูลค่าไม่เกิน ฿${baht(member.rewardCap)}`;
  const earn = `ขึ้นเอ็นและชำระแล้ว 1 ครั้ง = 1 ดาว${member.posMinAmount ? ` · ซื้อสินค้าครบ ฿${baht(member.posMinAmount)} = 1 ดาว` : ""}`;
  const reward = (ready: boolean, readyText: string, waitText: string) => ({
    type: "box", layout: "vertical", paddingAll: "10px", cornerRadius: "10px", backgroundColor: ready ? "#E6F6EE" : "#F4F6FB",
    contents: [text(ready ? readyText : waitText, { size: "sm", color: ready ? "#17804F" : NAVY, weight: ready ? "bold" : "regular" })],
  });
  const note = promoNote(member.promo);
  const ready = member.stringAvailable || member.socksAvailable;
  const rewards = fresh ? [
    ...(member.socksProductName ? [reward(false, "", `🧦 ครบ ${member.socksNeed} ดาว แลก${member.socksProductName}ฟรี`)] : []),
    reward(false, "", `🎁 ครบ ${need} ดาว ขึ้นเอ็นฟรี 1 ครั้ง (${cap})`),
    text(member.socksProductName ? "แลกของรางวัลอย่างใดอย่างหนึ่งแล้ว ดาวเริ่มนับใหม่" : "แลกแล้วดาวเริ่มนับใหม่", { size: "xs", color: MUTED }),
  ] : [
    ...(member.socksProductName ? [reward(member.socksAvailable,
      `🧦 แลก${member.socksProductName}ฟรีได้แล้ว! (ครบ ${member.socksNeed} ดาว)`,
      `สะสมอีก ${Math.max(0, member.socksNeed - member.stars)} ดาว แลก${member.socksProductName}ฟรี (ครบ ${member.socksNeed} ดาว)`)] : []),
    reward(member.stringAvailable,
      `🎁 ขึ้นเอ็นฟรีได้แล้ว! (ครบ ${need} ดาว · ${cap})`,
      `สะสมอีก ${Math.max(0, need - member.stars)} ดาว รับสิทธิ์ขึ้นเอ็นฟรี (ครบ ${need} ดาว · ${cap})`),
    text(ready ? "แลกได้ที่หน้าติดตามสถานะไม้ หรือแจ้งพนักงานที่ร้าน · แลกแล้วดาวเริ่มนับใหม่" : earn, { size: "xs", color: MUTED }),
  ];
  return {
    type: "flex",
    altText: fresh ? "บัตรสะสมดาว Wingpro Badminton" : `คะแนนสะสม ${member.stars} ดาว`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", paddingAll: "18px", backgroundColor: PURPLE,
        contents: [
          text("WINGPRO BADMINTON", { size: "xs", color: "#E5DBFF", weight: "bold" }),
          text("บัตรสะสมดาว", { size: "xl", color: "#FFFFFF", weight: "bold" }),
          ...(holder ? [text(holder, { size: "sm", color: "#FFFFFF" })] : []),
          ...(fresh ? [text(earn, { size: "xs", color: "#E5DBFF" })] : []),
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "18px", spacing: "md",
        contents: [
          {
            type: "box", layout: "baseline", spacing: "sm",
            contents: [text(String(Math.max(0, member.stars)), { size: "3xl", weight: "bold", color: PURPLE, flex: 0 }), text(`/ ${need} ดาว`, { size: "md", color: MUTED })],
          },
          ...(fresh ? [text(known ? "ยังไม่มีดาวสะสม เริ่มสะสมได้ตั้งแต่ขึ้นเอ็นครั้งถัดไป" : "ยังไม่มีดาวสะสมของเบอร์นี้ เริ่มสะสมได้ตั้งแต่ขึ้นเอ็นครั้งแรก", { size: "sm", color: NAVY })] : []),
          ...(grid.length ? [{ type: "box", layout: "vertical", spacing: "xs", paddingAll: "8px", cornerRadius: "12px", backgroundColor: "#F7F4FF", contents: grid }] : []),
          ...rewards,
          ...(note ? [text(note, { size: "xs", color: "#E0801A", weight: "bold" })] : []),
        ],
      },
      ...(/^https:\/\//.test(trackUrl) ? {
        footer: {
          type: "box", layout: "vertical", paddingAll: "14px",
          contents: [{ type: "button", style: "primary", color: PURPLE, height: "sm", action: { type: "uri", label: ready ? "แลกของรางวัล" : "ดูบัตรสะสมดาว", uri: trackUrl } }],
        },
      } : {}),
    },
  };
}

// "ราคาขึ้นเอ็น": the owner's price-list picture as a real image message (LINE shows it whole and lets the customer
// zoom in - a Flex hero would crop a tall price list), then the price text with the shop's phone number.
export function stringPriceMessages({ text: body = "", image = "", siteUrl = "", phone = "" }: { text?: string; image?: string | null; siteUrl?: string; phone?: string }) {
  const base = /^https:\/\//.test(siteUrl) ? siteUrl.replace(/\/$/, "") : "";
  const url = base && image ? `${base}/api/line/promo-image/${image}` : "";
  const contact = phone ? `สอบถามเพิ่มเติม โทร ${phone}` : "";
  const message = String(body).trim();
  return [
    ...(url ? [{ type: "image", originalContentUrl: url, previewImageUrl: url }] : []),
    { type: "text", text: message ? (contact ? `${message}\n\n${contact}` : message) : `สอบถามราคาขึ้นเอ็นแบดมินตันได้ที่ร้านเลย${contact ? `\n${contact}` : ""}` },
  ];
}

type ShopProduct = { id: string; name: string; category?: string | null; price: number; available: number; unit?: string | null; image?: string | null };

// A string's shop price already includes the stringing labour (the shop's own rule), so say so on the card.
export const isStringProduct = (product: { category?: string | null; name?: string }) => /เอ็น/.test(String(product.category || "")) && !isService(product);
// Labour and other services (บริการขึ้นเอ็น, เปลี่ยนตาไก่): a price, but no stock to speak of.
export const isService = (product: { category?: string | null; name?: string }) => /ค่าบริการ/.test(String(product.category || "")) || /^(บริการ|ค่า)/.test(String(product.name || "").trim());
const priceText = (product: ShopProduct) => product.price > 0 ? `฿${baht(product.price)}` : "สอบถามราคา";
const stockText = (product: ShopProduct) => product.available > 0 ? `มีสินค้า ${product.available} ${product.unit || "ชิ้น"}` : "สินค้าหมดชั่วคราว";
const LIST_LIMIT = 15;

// Answer to "มี X ไหม / X เท่าไหร่". One product: a card with its picture, price and how many are left. Several (most
// products here are one model in several colours): one list card - a row each with price and stock, in-stock
// first. Stock shown = stock minus strings already reserved for rackets in the queue, so a customer never hears
// "มี" for one that is spoken for.
export function productAnswerMessage(products: ShopProduct[], { siteUrl = "", phone = "", allQuery = "" }: { siteUrl?: string; phone?: string; allQuery?: string } = {}) {
  if (!products.length) return null;
  const base = /^https:\/\//.test(siteUrl) ? siteUrl.replace(/\/$/, "") : "";
  const tel = String(phone).replace(/[^0-9+]/g, "");
  const footer = (label: string) => tel ? { footer: { type: "box", layout: "vertical", paddingAll: "12px", contents: [{ type: "button", style: "secondary", height: "sm", action: { type: "uri", label, uri: `tel:${tel}` } }] } } : {};
  if (products.length === 1) {
    const product = products[0], inStock = product.available > 0, service = isService(product);
    return {
      type: "flex",
      altText: `${product.name} ${priceText(product)}`,
      contents: {
        type: "bubble",
        size: "mega",
        ...(base && product.image ? { hero: { type: "image", url: `${base}/api/line/promo-image/${product.image}`, size: "full", aspectRatio: "1:1", aspectMode: "cover" } } : {}),
        body: {
          type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm",
          contents: [
            ...(product.category ? [text(product.category, { size: "xs", color: MUTED })] : []),
            text(product.name, { size: "md", weight: "bold", color: NAVY }),
            text(priceText(product), { size: "xl", weight: "bold", color: BLUE }),
            ...(isStringProduct(product) ? [text("ราคารวมค่าขึ้นเอ็นแล้ว", { size: "xs", color: "#17804F" })] : []),
            ...(service ? [] : [text(stockText(product), { size: "sm", weight: "bold", color: inStock ? "#17804F" : "#CF4A44" })]),
          ],
        },
        ...footer(service || inStock ? "โทรสั่ง / จองสินค้า" : "สอบถามวันเข้า"),
      },
    };
  }
  // Several products: only what can be sold right now - "เอ็นทั้งหมดที่มีสินค้า" is 34 strings, not all 106 the shop
  // carries - with services (บริการขึ้นเอ็น) listed last and not counted as products. If every match is sold out, the
  // list shows them marked "หมด" so the customer still learns the shop carries them.
  const services = products.filter(isService), goods = products.filter(p => !isService(p));
  const inStock = goods.filter(p => p.available > 0);
  const listed = inStock.length ? inStock : goods;
  const shown = listed.slice(0, LIST_LIMIT), more = listed.length - shown.length;
  const row = (product: ShopProduct) => ({
    type: "box", layout: "horizontal", spacing: "sm", paddingTop: "6px",
    contents: [
      text(product.name, { size: "sm", color: NAVY, flex: 6 }),
      {
        type: "box", layout: "vertical", flex: 3,
        contents: [
          text(priceText(product), { size: "sm", weight: "bold", color: BLUE, align: "end" }),
          ...(isService(product) ? [] : [text(product.available > 0 ? `เหลือ ${product.available}` : "หมด", { size: "xxs", color: product.available > 0 ? "#17804F" : "#CF4A44", align: "end" })]),
        ],
      },
    ],
  });
  const title = !goods.length ? `ค่าบริการ ${services.length} รายการ` : inStock.length ? `มีสินค้า ${inStock.length} รายการ` : `หมดชั่วคราวทุกรายการ (${goods.length})`;
  // "ดูทั้งหมด" re-runs the same search (no AI) and answers with one card per brand - see productBrandCarousel.
  const moreButton = more > 0 && inStock.length && allQuery ? [{ type: "button", style: "primary", height: "sm", action: { type: "postback", label: "ดูทั้งหมด (แยกตามยี่ห้อ)", data: allQuery, displayText: "ดูทั้งหมด (แยกตามยี่ห้อ)" } }] : [];
  const callButton = tel ? [{ type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "โทรสอบถาม / จองสินค้า", uri: `tel:${tel}` } }] : [];
  const quickReply = brandQuickReply(goods, allQuery);
  return {
    type: "flex",
    altText: title,
    ...(quickReply ? { quickReply } : {}),
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "xs",
        contents: [
          text(title, { size: "md", weight: "bold", color: inStock.length || !goods.length ? NAVY : "#CF4A44" }),
          ...(goods.some(isStringProduct) ? [text("ราคาเอ็นรวมค่าขึ้นเอ็นแล้ว", { size: "xs", color: "#17804F" })] : []),
          { type: "separator", margin: "md" },
          ...shown.map(row),
          ...(more > 0 ? [text(`และอีก ${more} รายการ${moreButton.length ? " กด “ดูทั้งหมด” ด้านล่าง" : " พิมพ์ชื่อรุ่นหรือสีให้ละเอียดขึ้นเพื่อดูเพิ่ม"}`, { size: "xs", color: MUTED, margin: "md" })] : []),
          ...(services.length && goods.length ? [{ type: "separator", margin: "md" }, text("ค่าบริการ", { size: "xs", color: MUTED, margin: "md" })] : []),
          ...services.slice(0, 5).map(row),
        ],
      },
      ...(moreButton.length || callButton.length ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: [...moreButton, ...callButton] } } : {}),
    },
  };
}

// The brand a product belongs to, for "ดูทั้งหมด (แยกตามยี่ห้อ)": a known brand anywhere in the name ("เอ็น Li-Ning
// No.1" and "เอ็น Lining No.1" both -> Li-Ning), else the name's first Latin word ("เอ็น Kizuna Z58" -> Kizuna).
const BRAND_NAMES: [RegExp, string][] = [
  [/li[\s.\-_]*ning/i, "Li-Ning"], [/yonex/i, "Yonex"], [/victor/i, "Victor"], [/mizuno/i, "Mizuno"], [/gosen/i, "Gosen"],
  [/kizuna/i, "Kizuna"], [/toalson/i, "Toalson"], [/felet/i, "Felet"], [/apacs/i, "Apacs"], [/kawasaki/i, "Kawasaki"],
  [/babolat/i, "Babolat"], [/rsl/i, "RSL"], [/excella/i, "Excella"],
  // Model names the shop sometimes writes without the brand ("เอ็น Aerosonic Bright Pink", "เอ็นExbolt 65 White").
  [/aerosonic|exbolt|aerobite|\bbg ?\d|astrox|arcsaber|nanoflare|nanoray|duora|voltric|power cushion|aerus|eclipsion/i, "Yonex"],
  [/\bvbs|thruster|jetspeed|auraspeed|brave ?sword/i, "Victor"],
  [/aeronaut|axforce|halbertec|windstorm|calibar|bladex|tectonic/i, "Li-Ning"],
];
export function brandOf(name: string) {
  for (const [pattern, brand] of BRAND_NAMES) if (pattern.test(name)) return brand;
  const word = String(name).match(/[A-Za-z][A-Za-z0-9-]+/)?.[0];
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "อื่นๆ";
}

// Quick-reply buttons (the row of chips above the chat's text box) - one per brand among the in-stock matches, most
// items first, so a customer can narrow a long list with one tap. LINE: at most 13 buttons, labels up to 20
// characters, postback data up to 300 characters; the chips disappear once the customer taps one or types.
export function brandQuickReply(products: ShopProduct[], allQuery = "") {
  const q = new URLSearchParams(allQuery).get("q") || "";
  if (!q) return null;
  const counts = new Map<string, number>();
  for (const product of products) if (!isService(product) && product.available > 0) counts.set(brandOf(product.name), (counts.get(brandOf(product.name)) || 0) + 1);
  if (counts.size < 2) return null;
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 13).map(([brand, n]) => {
    let query = q, data = "";
    do { data = `action=brand&b=${encodeURIComponent(brand)}&q=${encodeURIComponent(query)}`; if (data.length > 300) query = query.slice(0, -1); } while (data.length > 300 && query);
    return data.length <= 300 && query ? { type: "action", action: { type: "postback", label: `${brand} (${n})`.slice(0, 20), data, displayText: `ดู ${brand}` } } : null;
  }).filter(Boolean);
  return items.length >= 2 ? { items } : null;
}

// "ดูทั้งหมด (แยกตามยี่ห้อ)": every in-stock match as a carousel, one card per brand (most first), in stock only.
// LINE allows at most 12 cards, so the smallest brands beyond 11 share an "อื่นๆ" card; rows per card are capped
// to keep the message well inside LINE's size limit.
export function productBrandCarousel(products: ShopProduct[], { phone = "", allQuery = "" }: { phone?: string; allQuery?: string } = {}) {
  const goods = products.filter(p => !isService(p) && p.available > 0);
  if (!goods.length) return null;
  const groups = new Map<string, ShopProduct[]>();
  for (const product of goods) groups.set(brandOf(product.name), [...(groups.get(brandOf(product.name)) || []), product]);
  let entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (entries.length > 12) entries = [...entries.slice(0, 11), ["อื่นๆ", entries.slice(11).flatMap(([, list]) => list)]];
  // A big brand is split over several cards ("Yonex (1/2)") so no single card gets near LINE's per-card size limit.
  const ROWS = 20;
  const cards = entries.flatMap(([brand, list]) => {
    const parts = Math.ceil(list.length / ROWS);
    return Array.from({ length: parts }, (_, i) => ({ brand: parts > 1 ? `${brand} (${i + 1}/${parts})` : brand, total: list.length, list: list.slice(i * ROWS, (i + 1) * ROWS) }));
  }).slice(0, 12);
  const tel = String(phone).replace(/[^0-9+]/g, "");
  const bubbles = cards.map(({ brand, total, list }) => ({
    type: "bubble",
    size: "kilo",
    body: {
      type: "box", layout: "vertical", paddingAll: "14px", spacing: "xs",
      contents: [
        text(brand, { size: "lg", weight: "bold", color: NAVY }),
        text(`มีสินค้า ${total} รายการ${list.some(isStringProduct) ? " · ราคารวมค่าขึ้นเอ็น" : ""}`, { size: "xxs", color: "#17804F" }),
        { type: "separator", margin: "sm" },
        ...list.map(product => ({
          type: "box", layout: "horizontal", spacing: "sm", paddingTop: "4px",
          contents: [
            text(product.name, { size: "xs", color: NAVY, flex: 6 }),
            text(`${priceText(product)}\nเหลือ ${product.available}`, { size: "xs", color: BLUE, align: "end", flex: 4 }),
          ],
        })),
      ],
    },
    ...(tel ? { footer: { type: "box", layout: "vertical", paddingAll: "10px", contents: [{ type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "โทรสั่ง / จอง", uri: `tel:${tel}` } }] } } : {}),
  }));
  const message = carousel(`มีสินค้า ${goods.length} รายการ แยกตามยี่ห้อ`, bubbles);
  const quickReply = brandQuickReply(goods, allQuery);
  return message && quickReply ? { ...message, quickReply } : message;
}

// Nothing in the shop matches: say so plainly, and that the shop has been told (the request is logged).
export function productNotFoundMessage(wanted: string, phone = "") {
  const tel = String(phone).replace(/[^0-9+]/g, "");
  const name = wanted.trim().slice(0, 80);
  return {
    type: "text",
    text: `ขออภัย ตอนนี้ร้านยังไม่มี${name ? ` “${name}”` : "สินค้านี้"} ร้านบันทึกไว้แล้วว่ามีลูกค้าต้องการ เผื่อนำเข้ามาขายในอนาคต${tel ? `\nสอบถามสินค้าใกล้เคียง โทร ${phone}` : ""}`,
  };
}

// "บัตรสมาชิก": the button to the member web page (sign up, add a phone, see everything) - opened with a signed link
// that identifies this LINE account (lib/line-member.ts). pending = phones still waiting for the shop to confirm.
export function memberLinkMessage(url: string, { registered = false, pending = [] as string[] } = {}) {
  if (!/^https:\/\//.test(url)) return null;
  return {
    type: "flex",
    altText: registered ? "จัดการบัตรสมาชิก" : "สมัครสมาชิก Wingpro",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm",
        contents: [
          text(registered ? "บัตรสมาชิก" : "ยังไม่ได้เป็นสมาชิก", { size: "md", weight: "bold", color: NAVY }),
          text(registered ? "ดูดาวสะสม ไม้ที่อยู่ที่ร้าน หรือเพิ่มเบอร์โทรอื่น" : "สมัครฟรี กรอกแค่ชื่อและเบอร์โทร ดาวสะสมเดิมรวมให้อัตโนมัติ และรับแจ้งสถานะไม้ใน LINE", { size: "xs", color: MUTED }),
          ...pending.map(phone => text(`⏳ ${phone} รอร้านยืนยัน`, { size: "xs", color: "#A77922" })),
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "12px",
        contents: [{ type: "button", style: "primary", color: PURPLE, height: "sm", action: { type: "uri", label: registered ? "เปิดบัตรสมาชิก" : "สมัครสมาชิก", uri: url } }],
      },
    },
  };
}

// "ติดตามงานขึ้นเอ็น" for a LINE member with nothing at the shop right now: say so for their number(s) - rather than
// asking for a phone they already registered - with their last few finished jobs, and the member page button.
export function noActiveJobsMessage({ phones, recent = [], url = "" }: { phones: string[]; recent?: { racket: string; status: string; created: string }[]; url?: string }) {
  const day = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
  return {
    type: "flex",
    altText: "ตอนนี้ไม่มีไม้ของคุณที่ร้าน",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "sm",
        contents: [
          text("ตอนนี้ไม่มีไม้ของคุณที่ร้าน", { size: "md", weight: "bold", color: NAVY }),
          text(`สมาชิก ${phones.join(", ")}`, { size: "xs", color: MUTED }),
          ...(recent.length ? [
            { type: "separator", margin: "md" },
            text("งานล่าสุด", { size: "xs", color: MUTED, margin: "md" }),
            ...recent.map(job => ({
              type: "box", layout: "horizontal", spacing: "sm",
              contents: [text(job.racket, { size: "sm", color: NAVY, flex: 5 }), text(`${job.status}\n${day(job.created)}`, { size: "xxs", color: MUTED, align: "end", flex: 3 })],
            })),
          ] : []),
          text("ฝากไม้ด้วยเบอร์อื่น? เพิ่มเบอร์ในบัตรสมาชิก หรือพิมพ์เบอร์นั้นมาได้เลย", { size: "xxs", color: MUTED, margin: "md" }),
        ],
      },
      ...(/^https:\/\//.test(url) ? {
        footer: {
          type: "box", layout: "vertical", paddingAll: "12px",
          contents: [{ type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "เปิดบัตรสมาชิก", uri: url } }],
        },
      } : {}),
    },
  };
}
