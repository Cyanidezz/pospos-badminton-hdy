// The shop's LINE OA rich menu over public/line-richmenu.jpg (2500x1686): a 3 x 2 grid of buttons. Pure data, so
// the layout and actions are easy to check; app/api/line/richmenu installs it through the Messaging API.
export const RICH_MENU_NAME = "wingpro-main";
export const RICH_MENU_IMAGE = "/line-richmenu.jpg";

const postback = (label: string, data: string) => ({ type: "postback", label, data, displayText: label });

export function richMenuBody({ facebook, phone }: { facebook: string; phone: string }) {
  // 3 x 2 grid: columns 833 / 834 / 833, rows 843 / 843.
  const cell = (col: number, row: number) => ({ x: [0, 833, 1667][col], y: row * 843, width: col === 1 ? 834 : 833, height: 843 });
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: RICH_MENU_NAME,
    chatBarText: "เมนูร้าน",
    areas: [
      { bounds: cell(0, 0), action: postback("ติดตามงานขึ้นเอ็น", "action=track") },
      { bounds: cell(1, 0), action: postback("บัตรสมาชิก", "action=member") },
      { bounds: cell(2, 0), action: postback("โปรโมชั่น", "action=promo") },
      { bounds: cell(0, 1), action: postback("ราคาขึ้นเอ็น", "action=price") },
      { bounds: cell(1, 1), action: { type: "uri", label: "Facebook ร้าน", uri: facebook } },
      { bounds: cell(2, 1), action: { type: "uri", label: "โทรหาร้าน", uri: `tel:${phone.replace(/[^0-9+]/g, "")}` } },
    ],
  };
}
