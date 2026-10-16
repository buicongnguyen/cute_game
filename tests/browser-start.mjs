// Fresh profiles first show the three welcome cards (welcome-cards.ts); older builds showed Pepper's welcome offer.
// Layout and gameplay fixtures skip the cards (or take the ordinary "No, thanks" path) before interacting with the world HUD.
export async function dismissWelcome(page) {
  const skip = page.locator('[data-wc="skip"]'), decline = page.locator('[data-action="welcome-pass"]');
  await skip.or(decline).first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  for (const button of [skip, decline]) if (await button.isVisible()) {
    await button.click();
    await page.waitForSelector('#dialog-layer', { state: 'hidden' });
  }
}
