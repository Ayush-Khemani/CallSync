import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    BrowserRouter: ({ children }) => <div>{children}</div>,
    Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
    Routes: ({ children }) => <div>{React.Children.toArray(children)[0]}</div>,
    Route: ({ element }) => element,
    useNavigate: () => jest.fn(),
  };
}, { virtual: true });

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}), { virtual: true });

test('renders CallSync login page', () => {
  render(<App />);
  const linkElement = screen.getByRole('heading', { name: /CallSync/i });
  expect(linkElement).toBeInTheDocument();
});
