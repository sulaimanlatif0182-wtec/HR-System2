import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Sign in');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows validation errors for empty submit', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('redirects to dashboard on successful login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@hrsystem.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
  });
});

test.describe('Dashboard', () => {
  test('shows KPI cards for admin', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@hrsystem.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
    await expect(page.locator('text=Visible Employees')).toBeVisible();
    await expect(page.locator('text=Present Today')).toBeVisible();
    await expect(page.locator('text=Late Today')).toBeVisible();
  });
});