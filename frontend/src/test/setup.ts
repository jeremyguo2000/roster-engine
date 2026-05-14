import "@testing-library/jest-dom";

/**
 * jsdom doesn't implement Pointer Capture, but Radix uses it. Without this,
 * any test that opens a Radix Select/Popover throws
 * "target.hasPointerCapture is not a function".
 */
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
