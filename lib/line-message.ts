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

// "เช็คคะแนนสะสม": stars so far, a dot per stamp (the socks milestone marked), and what each reward still needs.
// trackUrl (the customer's own open job) is only passed for a LINE account already linked to that job - someone
// who just typed a phone number sees the numbers, never a link into another person's job.
export function memberCardMessage(member: Member, { trackUrl = "" }: { trackUrl?: string } = {}) {
  const need = Math.max(1, member.stringNeed);
  const dots = need <= 20 ? Array.from({ length: need }, (_, i) => ({
    type: "box", layout: "vertical", width: "20px", height: "20px", cornerRadius: "10px", justifyContent: "center",
    backgroundColor: i < member.stars ? PURPLE : TRACK,
    ...(i === member.socksNeed - 1 && member.socksProductName ? { borderWidth: "2px", borderColor: "#E0801A" } : {}),
    contents: [text(i < member.stars ? "★" : " ", { size: "xxs", color: "#FFFFFF", align: "center" })],
  })) : [];
  const cap = member.rewardCap === null || member.rewardCap === undefined ? "ฟรีค่าขึ้นเอ็นทั้งหมด" : `เอ็นมูลค่าไม่เกิน ฿${baht(member.rewardCap)}`;
  const reward = (ready: boolean, readyText: string, waitText: string) => ({
    type: "box", layout: "vertical", paddingAll: "10px", cornerRadius: "10px", backgroundColor: ready ? "#E6F6EE" : "#F4F6FB",
    contents: [text(ready ? readyText : waitText, { size: "sm", color: ready ? "#17804F" : NAVY, weight: ready ? "bold" : "regular" })],
  });
  const note = promoNote(member.promo);
  const ready = member.stringAvailable || member.socksAvailable;
  return {
    type: "flex",
    altText: `คะแนนสะสม ${member.stars} ดาว`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", paddingAll: "18px", backgroundColor: PURPLE,
        contents: [
          text("WINGPRO BADMINTON", { size: "xs", color: "#E5DBFF", weight: "bold" }),
          text("บัตรสะสมดาว", { size: "xl", color: "#FFFFFF", weight: "bold" }),
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "18px", spacing: "md",
        contents: [
          {
            type: "box", layout: "baseline", spacing: "sm",
            contents: [text(String(member.stars), { size: "3xl", weight: "bold", color: PURPLE, flex: 0 }), text(`/ ${need} ดาว`, { size: "md", color: MUTED })],
          },
          ...(dots.length ? [{ type: "box", layout: "horizontal", spacing: "xs", flexWrap: "wrap", contents: dots }] : []),
          ...(member.socksProductName ? [reward(member.socksAvailable,
            `🧦 แลก${member.socksProductName}ฟรีได้แล้ว! (ครบ ${member.socksNeed} ดาว)`,
            `สะสมอีก ${Math.max(0, member.socksNeed - member.stars)} ดาว แลก${member.socksProductName}ฟรี (ครบ ${member.socksNeed} ดาว)`)] : []),
          reward(member.stringAvailable,
            `🎁 ขึ้นเอ็นฟรีได้แล้ว! (ครบ ${need} ดาว · ${cap})`,
            `สะสมอีก ${Math.max(0, need - member.stars)} ดาว รับสิทธิ์ขึ้นเอ็นฟรี (ครบ ${need} ดาว · ${cap})`),
          text(ready ? "แลกได้ที่หน้าติดตามสถานะไม้ หรือแจ้งพนักงานที่ร้าน · แลกแล้วดาวเริ่มนับใหม่" : `ได้ 1 ดาวทุกครั้งที่ขึ้นเอ็น หรือซื้อสินค้าที่ร้าน${member.posMinAmount ? ` ครบ ฿${baht(member.posMinAmount)}` : ""}`, { size: "xs", color: MUTED }),
          ...(note ? [text(note, { size: "xs", color: "#E0801A" })] : []),
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
export function productAnswerMessage(products: ShopProduct[], { siteUrl = "", phone = "" }: { siteUrl?: string; phone?: string } = {}) {
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
  const sorted = [...products].sort((a, b) => Number(b.available > 0 || isService(b)) - Number(a.available > 0 || isService(a)));
  const shown = sorted.slice(0, LIST_LIMIT), more = sorted.length - shown.length;
  const rows = shown.map(product => ({
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
  }));
  return {
    type: "flex",
    altText: `สินค้าที่ตรงกับที่ถาม ${products.length} รายการ`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "xs",
        contents: [
          text(`พบ ${products.length} รายการ`, { size: "md", weight: "bold", color: NAVY }),
          ...(products.some(isStringProduct) ? [text("ราคาเอ็นรวมค่าขึ้นเอ็นแล้ว", { size: "xs", color: "#17804F" })] : []),
          { type: "separator", margin: "md" },
          ...rows,
          ...(more > 0 ? [text(`และอีก ${more} รายการ พิมพ์ชื่อรุ่นหรือสีให้ละเอียดขึ้นเพื่อดูเพิ่ม`, { size: "xs", color: MUTED, margin: "md" })] : []),
        ],
      },
      ...footer("โทรสอบถาม / จองสินค้า"),
    },
  };
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
