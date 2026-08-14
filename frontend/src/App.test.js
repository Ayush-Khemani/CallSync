import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => <div>{children}</div>,
  Routes: ({ children }) => <div>{children[0]}</div>,
  Route: ({ element }) => element,
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}), { virtual: true });

test('renders CallSync login page', () => {
  render(<App />);
  const linkElement = screen.getByText(/CallSync - Meeting Scheduler/i);
  expect(linkElement).toBeInTheDocument();
});
