import { fireEvent, render, screen } from '@testing-library/react';
import LandingPage, { LandingInfoPage } from './LandingPage';

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
});

test('routes the primary action to the existing login or authenticated workspace', () => {
  const { unmount } = render(<LandingPage />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your meetings, handled.Your attention, back.');
  screen.getAllByRole('link', { name: /open callsync/i }).forEach(link => expect(link).toHaveAttribute('href', '/login'));
  unmount();
  localStorage.setItem('token', 'test-session');
  render(<LandingPage />);
  screen.getAllByRole('link', { name: /open callsync/i }).forEach(link => expect(link).toHaveAttribute('href', '/dashboard'));
});

test('lets visitors switch examples with keyboard and keeps sending explicitly gated', () => {
  render(<LandingPage />);
  const schedule = screen.getByRole('tab', { name: 'Schedule a call' });
  fireEvent.keyDown(schedule, { key: 'End' });
  const followUp = screen.getByRole('tab', { name: 'Draft a follow up' });
  expect(followUp).toHaveFocus();
  expect(followUp).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Nothing sent without approval');
  fireEvent.keyDown(followUp, { key: 'ArrowRight' });
  expect(schedule).toHaveFocus();
  expect(schedule).toHaveAttribute('aria-selected', 'true');
});

test('mobile navigation restores scrolling and focus on Escape', () => {
  render(<LandingPage />);
  const toggle = screen.getByRole('button', { name: 'Open navigation' });
  fireEvent.click(toggle);
  expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('');
  expect(toggle).toHaveFocus();
});

test('footer policy pages disclose missing owner supplied policies and offer a route home', () => {
  render(<LandingInfoPage kind="privacy" />);
  expect(screen.getByText(/not a complete privacy policy/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /back to callsync/i })).toHaveAttribute('href', '/');
});

test('unknown pages show a branded recovery path', () => {
  render(<LandingInfoPage kind="not-found" />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found.');
  expect(screen.getByRole('link', { name: /back to callsync/i })).toHaveAttribute('href', '/');
});
