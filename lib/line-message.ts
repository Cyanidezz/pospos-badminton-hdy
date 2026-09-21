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
