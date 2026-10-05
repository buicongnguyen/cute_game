// Fresh profiles first show Pepper's welcome offer. Layout and gameplay fixtures
// take the ordinary "No, thanks" path before interacting with the world HUD.
export async function dismissWelcome(page) {
  const decline = page.locator('[data-action="welcome-pass"]');
  if (await decline.isVisible()) {
    await decline.click();
    await page.waitForSelector('#dialog-layer', { state: 'hidden' });
  }
}
