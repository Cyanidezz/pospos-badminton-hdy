// The shop's LINE OA rich menu: a 2x2 grid over public/line-richmenu.jpg (2500x1686). Pure data, so the layout and
// actions are easy to check; app/api/line/richmenu installs it through the Messaging API.
export const RICH_MENU_NAME = "wingpro-main";
export const RICH_MENU_IMAGE = "/line-richmenu.jpg";

export function richMenuBody({ facebook, phone }: { facebook: string; phone: string }) {
  const half = { width: 1250, height: 843 };
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: RICH_MENU_NAME,
    chatBarText: "เมนูร้าน",
    areas: [
      { bounds: { x: 0, y: 0, ...half }, action: { type: "postback", label: "ติดตามงานขึ้นเอ็น", data: "action=track", displayText: "ติดตามงานขึ้นเอ็น" } },
      { bounds: { x: 1250, y: 0, ...half }, action: { type: "postback", label: "โปรโมชั่น", data: "action=promo", displayText: "โปรโมชั่น" } },
      { bounds: { x: 0, y: 843, ...half }, action: { type: "uri", label: "Facebook ร้าน", uri: facebook } },
      { bounds: { x: 1250, y: 843, ...half }, action: { type: "uri", label: "โทรหาร้าน", uri: `tel:${phone.replace(/[^0-9+]/g, "")}` } },
    ],
  };
}
