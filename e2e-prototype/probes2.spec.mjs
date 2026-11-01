// PROTOTYPE, throwaway. Can synthetic drag events split panes and open a popout window?
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const composers = async (b) => (await b.$$('textarea[aria-label="Write a message…"]').getElements()).length;

describe('tab probes', () => {
  it('synthetic tab drop splits the view', async () => {
    await reset('groups');
    const alice = user('alice');
    await alice.openChat('Weekend');
    await alice.openChat('Bob Test');
    const out = await alice.b.execute(async () => {
      const wait = () => new Promise((r) => setTimeout(r, 150));
      const tab = document.querySelector('[draggable="true"].cursor-grab');
      const dataTransfer = new DataTransfer();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
      fire(tab, 'dragstart');
      await wait();
      const zone = document.querySelector('.absolute.inset-0.z-20.flex');
      if (!zone) return 'no drop zone rendered';
      const right = zone.children[1];
      fire(right, 'dragover');
      await wait();
      fire(right, 'drop');
      fire(tab, 'dragend');
      return 'fired';
    });
    await browser.pause(800);
    log(`synthetic tab ${out}: composers now ${await composers(alice.b)}`);
  });

  it('synthetic drag-out opens a popout', async () => {
    await reset('groups');
    const alice = user('alice');
    await alice.openChat('Weekend');
    const before = await alice.b.getWindowHandles();
    const out = await alice.b.execute(async () => {
      const tab = document.querySelector('[draggable="true"].cursor-grab');
      const dataTransfer = new DataTransfer();
      tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      await new Promise((r) => setTimeout(r, 150));
      document.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: null }));
      tab.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer, clientX: -50, clientY: -50 }));
      return dataTransfer.dropEffect;
    });
    await browser.pause(2_000);
    const after = await alice.b.getWindowHandles();
    log(`drag-out dropEffect=${out}: windows ${before.length} -> ${after.length}`);
    const extra = after.find((h) => !before.includes(h));
    if (extra) {
      const main = await alice.b.getWindowHandle();
      await alice.b.switchToWindow(extra);
      await browser.pause(1_500);
      await alice.sees('Seeded group hello').then(() => log('popout shows the chat, signed in'), (e) => log(`popout: ${e.message}`));
      log(`popout url: ${await alice.b.getUrl()}`);
      await alice.b.closeWindow().catch((e) => log(`close: ${e.message}`));
      await alice.b.switchToWindow(main);
    }
  });
});
