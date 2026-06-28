// app-shell.js - Holy Grail layout custom element.
//
// Modelled on web-component-II's <wb-shell> (used here as a reference, not a
// dependency). Five named slots: north, west, center, east, south. CENTER is
// required and greedy; the other four collapse out of the CSS grid when their
// slot is empty. Slotted elements live in light DOM, so the app's index.css
// styles them directly via [slot="..."] selectors.

const OPTIONAL = ['north', 'west', 'east', 'south'];

const CSS = `
  :host { display: block; height: 100%; width: 100%; }
  .shell {
    display: grid;
    height: 100%;
    width: 100%;
    grid-template-columns: auto 1fr auto;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "north north north"
      "west center east"
      "south south south";
    min-height: 0;
    min-width: 0;
  }
  .region { min-width: 0; min-height: 0; overflow: hidden; }
  .region[hidden] { display: none; }
  .north  { grid-area: north; }
  .west   { grid-area: west; }
  .center { grid-area: center; position: relative; }
  .east   { grid-area: east; }
  .south  { grid-area: south; }
`;

export class AppShell extends HTMLElement {
    connectedCallback() {
        if (this._init) return;
        this._init = true;

        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            <style>${CSS}</style>
            <div class="shell">
                <header part="north" class="region north" hidden><slot name="north"></slot></header>
                <aside  part="west"  class="region west"  hidden><slot name="west"></slot></aside>
                <main   part="center" class="region center"><slot name="center"></slot></main>
                <aside  part="east"  class="region east"  hidden><slot name="east"></slot></aside>
                <footer part="south" class="region south" hidden><slot name="south"></slot></footer>
            </div>`;

        for (const name of OPTIONAL) {
            const slot = root.querySelector(`slot[name="${name}"]`);
            const region = root.querySelector(`.${name}`);
            const update = () => { region.hidden = !slotHasContent(slot); };
            slot.addEventListener('slotchange', update);
            update();
        }
    }
}

function slotHasContent(slot) {
    return slot.assignedNodes({ flatten: true }).some((n) => {
        if (n.nodeType === Node.ELEMENT_NODE) return true;
        return n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0;
    });
}

customElements.define('app-shell', AppShell);
export default AppShell;
