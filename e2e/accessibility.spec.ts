import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES_TO_TEST = [
  { path: '/login', name: 'Login Page', loginRequired: false },
  { path: '/', name: 'Dashboard', loginRequired: true },
  { path: '/employees', name: 'Employees', loginRequired: true },
  { path: '/attendance', name: 'Attendance', loginRequired: true },
  { path: '/leave', name: 'Leave', loginRequired: true },
  { path: '/claims', name: 'Claims', loginRequired: true },
  { path: '/payroll', name: 'Payroll', loginRequired: true },
  { path: '/profile', name: 'Profile', loginRequired: true },
];

async function loginIfNeeded(page, loginRequired) {
  if (!loginRequired) return;
  
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@hrsystem.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
}

test.describe('Accessibility Tests', () => {
  for (const pageConfig of PAGES_TO_TEST) {
    test(`${pageConfig.name} - no accessibility violations`, async ({ page }) => {
      await loginIfNeeded(page, pageConfig.loginRequired);
      await page.goto(pageConfig.path);
      
      // Wait for page to fully load
      await page.waitForLoadState('networkidle');
      
      // Run axe accessibility scan
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
      
      // Log violations for debugging
      if (accessibilityScanResults.violations.length > 0) {
        console.log(`Accessibility violations on ${pageConfig.name}:`, 
          JSON.stringify(accessibilityScanResults.violations, null, 2));
      }
      
      // Expect no violations
      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }
});

test.describe('Keyboard Navigation', () => {
  test('Login page is keyboard navigable', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form elements
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="email"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="password"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button[type="submit"]')).toBeFocused();
  });

  test('Dashboard has proper heading hierarchy', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@hrsystem.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Check heading hierarchy
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1.first()).toContainText('HR Dashboard');
    
    // Check for proper landmarks
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });
});

test.describe('Color Contrast', () => {
  test('Dashboard KPI cards have sufficient contrast', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@hrsystem.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Run axe with only color contrast rules
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();
    
    const contrastViolations = results.violations.filter(v => 
      v.id === 'color-contrast' || v.id === 'link-in-text-block'
    );
    
    expect(contrastViolations).toEqual([]);
  });
});