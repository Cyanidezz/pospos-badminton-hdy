// The shop's LINE OA rich menu over public/line-richmenu.jpg (2500x1686): three buttons on the top row, two on the
// bottom. Pure data, so the layout and actions are easy to check; app/api/line/richmenu installs it through the
// Messaging API.
export const RICH_MENU_NAME = "wingpro-main";
export const RICH_MENU_IMAGE = "/line-richmenu.jpg";

const postback = (label: string, data: string) => ({ type: "postback", label, data, displayText: label });

export function richMenuBody({ facebook, phone }: { facebook: string; phone: string }) {
  const top = 843, bottom = 1686 - top;
  return {
    size: { width: 2500, height: 1686 },
    selected: true,
    name: RICH_MENU_NAME,
    chatBarText: "เมนูร้าน",
    areas: [
      { bounds: { x: 0, y: 0, width: 833, height: top }, action: postback("ติดตามงานขึ้นเอ็น", "action=track") },
      { bounds: { x: 833, y: 0, width: 834, height: top }, action: postback("เช็คคะแนนสะสม", "action=points") },
      { bounds: { x: 1667, y: 0, width: 833, height: top }, action: postback("โปรโมชั่น", "action=promo") },
      { bounds: { x: 0, y: top, width: 1250, height: bottom }, action: { type: "uri", label: "Facebook ร้าน", uri: facebook } },
      { bounds: { x: 1250, y: top, width: 1250, height: bottom }, action: { type: "uri", label: "โทรหาร้าน", uri: `tel:${phone.replace(/[^0-9+]/g, "")}` } },
    ],
  };
}
