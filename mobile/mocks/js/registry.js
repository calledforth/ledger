import { render as quiet } from "./dirs/quiet.js";
import { render as letter } from "./dirs/letter.js";
import { render as deck } from "./dirs/deck.js";
import { render as receipt } from "./dirs/receipt.js";
import { render as twin } from "./dirs/twin.js";
import { render as night } from "./dirs/night.js";

export const RENDERERS = { quiet, letter, deck, receipt, twin, night };

export const THEMES = {
  quiet: { className: "quiet", lightBar: false },
  letter: { className: "letter", lightBar: false },
  deck: { className: "deck", lightBar: true },
  receipt: { className: "receipt", lightBar: true },
  twin: { className: "twin", lightBar: false },
  night: { className: "night", lightBar: true },
};
