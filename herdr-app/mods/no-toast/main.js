import { View, div } from "gpui-kit";
import { closeOverlay, props } from "herdr";

export default class NoToast extends View {
  init() {
    const overlay = props()?.overlay;
    if (overlay) {
      closeOverlay(overlay);
    }
  }

  render(_cx) {
    return div();
  }
}
