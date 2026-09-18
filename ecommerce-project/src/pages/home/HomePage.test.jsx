import { it, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { productsApi } from '../../api/products';
import { HomePage } from './HomePage';

vi.mock('../../api/products', () => ({
  productsApi: {
    listProducts: vi.fn(),
    getProductById: vi.fn(),
  },
  default: {
    listProducts: vi.fn(),
    getProductById: vi.fn(),
  },
}));

vi.mock('../../api/auth', () => ({
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
  default: {
    getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

describe('HomePage component', () => {
  let loadCart;

  beforeEach(() => {
    vi.clearAllMocks();
    loadCart = vi.fn();

    productsApi.listProducts.mockResolvedValue({
      products: [
        {
          id: 'e43638ce-6aa0-4b85-b27f-e1d07eb678c6',
          image_url: 'images/products/athletic-cotton-socks-6-pairs.jpg',
          name: 'Black and Gray Athletic Cotton Socks - 6 Pairs',
          description: 'High quality cotton socks',
          price_paise: 109000,
          category: 'Apparel',
          available_quantity: 50,
        },
        {
          id: '15b6fc6f-327a-4ec4-896f-486349e85a3d',
          image_url: 'images/products/intermediate-composite-basketball.jpg',
          name: 'Intermediate Size Basketball',
          description: 'Official size composite basketball',
          price_paise: 209500,
          category: 'Sports',
          available_quantity: 20,
        },
      ],
      pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays the products correctly', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );
    const productContainers = await screen.findAllByTestId('product-container');

    expect(productContainers.length).toBe(2);

    expect(
      within(productContainers[0])
        .getByText('Black and Gray Athletic Cotton Socks - 6 Pairs')
    ).toBeInTheDocument();

    expect(
      within(productContainers[1])
        .getByText('Intermediate Size Basketball')
    ).toBeInTheDocument();
  });

  it('maps category tabs to canonical backend values when clicked', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    // Initial load: 'ALL' sends undefined category
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: undefined,
      });
    });

    // Click 'APPAREL' tab -> sends 'Apparel'
    const apparelTab = screen.getByRole('button', { name: 'APPAREL' });
    fireEvent.click(apparelTab);
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: 'Apparel',
      });
    });

    // Click 'LIVING' tab -> sends 'Living'
    const livingTab = screen.getByRole('button', { name: 'LIVING' });
    fireEvent.click(livingTab);
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: 'Living',
      });
    });

    // Click 'FOOTWEAR' tab -> sends 'Footwear'
    const footwearTab = screen.getByRole('button', { name: 'FOOTWEAR' });
    fireEvent.click(footwearTab);
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: 'Footwear',
      });
    });

    // Click 'ACCESSORIES' tab -> sends 'Accessories'
    const accessoriesTab = screen.getByRole('button', { name: 'ACCESSORIES' });
    fireEvent.click(accessoriesTab);
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: 'Accessories',
      });
    });

    // Click 'ALL' tab -> sends undefined
    const allTab = screen.getByRole('button', { name: 'ALL' });
    fireEvent.click(allTab);
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: undefined,
      });
    });
  });

  it('directly renders backend-returned products for category without keywords filtering', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    // Initial products loaded
    expect(await screen.findByText('Black and Gray Athletic Cotton Socks - 6 Pairs')).toBeInTheDocument();

    // Mock response for the LIVING category filter click
    productsApi.listProducts.mockResolvedValueOnce({
      products: [
        {
          id: 'living-product-id',
          image_url: 'images/products/artisanal-ceramic-vessel.jpg',
          name: 'Artisanal Ceramic Vessel',
          description: 'Hand-thrown stoneware vessel',
          price_paise: 420000,
          category: 'Living',
          available_quantity: 18,
        },
      ],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });

    const livingTab = screen.getByRole('button', { name: 'LIVING' });
    fireEvent.click(livingTab);

    expect(await screen.findByText('Artisanal Ceramic Vessel')).toBeInTheDocument();
  });

  it('triggers search automatically after the debounce period without requiring Enter', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: undefined,
        category: undefined,
      });
    });
    expect(productsApi.listProducts).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    try {
      const searchInput = screen.getByPlaceholderText('Search collections, essentials...');
      fireEvent.change(searchInput, { target: { value: 'socks' } });

      // Halfway through debounce window (150ms) - no search dispatched yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(productsApi.listProducts).toHaveBeenCalledTimes(1);

      // After remaining debounce time (300ms total) - search is dispatched
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: 'socks',
        category: undefined,
      });
      expect(productsApi.listProducts).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses rapid typing into a single debounced search request', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledTimes(1);
    });

    vi.useFakeTimers();
    try {
      const searchInput = screen.getByPlaceholderText('Search collections, essentials...');

      // Simulate typing 'apparel' rapidly (100ms between keystrokes)
      fireEvent.change(searchInput, { target: { value: 'a' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.change(searchInput, { target: { value: 'ap' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.change(searchInput, { target: { value: 'app' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.change(searchInput, { target: { value: 'appa' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.change(searchInput, { target: { value: 'apparel' } });
      // Still in debounce window - only initial load was dispatched
      expect(productsApi.listProducts).toHaveBeenCalledTimes(1);

      // Complete the debounce period after final keystroke
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(productsApi.listProducts).toHaveBeenCalledTimes(2);
      expect(productsApi.listProducts).toHaveBeenLastCalledWith({
        search: 'apparel',
        category: undefined,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores normal catalog when search input is cleared or whitespace-only', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledTimes(1);
    });

    vi.useFakeTimers();
    try {
      const searchInput = screen.getByPlaceholderText('Search collections, essentials...');

      // Type search term
      fireEvent.change(searchInput, { target: { value: 'socks' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(productsApi.listProducts).toHaveBeenLastCalledWith({
        search: 'socks',
        category: undefined,
      });

      // Clear with whitespace
      fireEvent.change(searchInput, { target: { value: '   ' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // Normal catalog restored
      expect(productsApi.listProducts).toHaveBeenLastCalledWith({
        search: undefined,
        category: undefined,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends category and search parameters together and preserves category selection', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledTimes(1);
    });

    // Select APPAREL category
    const apparelTab = screen.getByRole('button', { name: 'APPAREL' });
    fireEvent.click(apparelTab);
    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenLastCalledWith({
        search: undefined,
        category: 'Apparel',
      });
    });

    vi.useFakeTimers();
    try {
      // Type search term within APPAREL
      const searchInput = screen.getByPlaceholderText('Search collections, essentials...');
      fireEvent.change(searchInput, { target: { value: 'cotton' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(productsApi.listProducts).toHaveBeenLastCalledWith({
        search: 'cotton',
        category: 'Apparel',
      });
      expect(apparelTab).toHaveClass('active');
    } finally {
      vi.useRealTimers();
    }
  });

  it('submits search immediately on Enter key press without waiting for debounce', async () => {
    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledTimes(1);
    });

    vi.useFakeTimers();
    try {
      const searchInput = screen.getByPlaceholderText('Search collections, essentials...');
      fireEvent.change(searchInput, { target: { value: 'leather' } });

      // Advance only 50ms (debounce has not expired)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(productsApi.listProducts).toHaveBeenCalledTimes(1);

      // Press Enter / submit form
      await act(async () => {
        fireEvent.submit(searchInput.closest('form'));
      });

      expect(productsApi.listProducts).toHaveBeenCalledTimes(2);
      expect(productsApi.listProducts).toHaveBeenLastCalledWith({
        search: 'leather',
        category: undefined,
      });

      // Ensure no duplicate request is fired when the 300ms debounce timer would have expired
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(productsApi.listProducts).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prevents a slow stale response from overwriting newer search results', async () => {
    let resolveFirstRequest;
    const firstRequestPromise = new Promise((resolve) => {
      resolveFirstRequest = resolve;
    });

    // First search returns a delayed promise
    productsApi.listProducts.mockReturnValueOnce(firstRequestPromise);

    render(
      <MemoryRouter initialEntries={['/?search=first']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(productsApi.listProducts).toHaveBeenCalledWith({
        search: 'first',
        category: undefined,
      });
    });

    // Second search resolves immediately with newer product
    productsApi.listProducts.mockResolvedValueOnce({
      products: [
        {
          id: 'newer-product-id',
          image_url: 'images/products/newer.jpg',
          name: 'Newer Fresh Product',
          description: 'Fresh search result',
          price_paise: 99900,
          category: 'Living',
          available_quantity: 10,
        },
      ],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });

    // Trigger newer search by changing category
    const livingTab = screen.getByRole('button', { name: 'LIVING' });
    fireEvent.click(livingTab);

    // Verify newer search result renders
    expect(await screen.findByText('Newer Fresh Product')).toBeInTheDocument();

    // Now resolve the older delayed first request
    resolveFirstRequest({
      products: [
        {
          id: 'stale-product-id',
          image_url: 'images/products/stale.jpg',
          name: 'Stale Older Product',
          description: 'Stale search result',
          price_paise: 55500,
          category: 'Living',
          available_quantity: 5,
        },
      ],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });

    // Stale result should be ignored and newer product preserved
    await waitFor(() => {
      expect(screen.getByText('Newer Fresh Product')).toBeInTheDocument();
      expect(screen.queryByText('Stale Older Product')).not.toBeInTheDocument();
    });
  });

  it('renders empty state when search returns no products', async () => {
    productsApi.listProducts.mockResolvedValueOnce({
      products: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
    });

    render(
      <MemoryRouter initialEntries={['/?search=nonexistent']}>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText('No products found')).toBeInTheDocument();
    expect(
      screen.getByText(/No items match your search for "nonexistent"/i)
    ).toBeInTheDocument();
  });

  it('renders error state on API failure and allows retry', async () => {
    productsApi.listProducts.mockRejectedValueOnce(new Error('Network error loading catalog'));

    render(
      <MemoryRouter>
        <HomePage cart={[]} loadCart={loadCart} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Unable to load collection')).toBeInTheDocument();
    expect(screen.getByText('Network error loading catalog')).toBeInTheDocument();

    // Successful retry
    productsApi.listProducts.mockResolvedValueOnce({
      products: [
        {
          id: 'retry-prod-id',
          image_url: 'images/products/retry.jpg',
          name: 'Retry Success Product',
          description: 'Desc',
          price_paise: 10000,
          category: 'Apparel',
          available_quantity: 10,
        },
      ],
      pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Retry Success Product')).toBeInTheDocument();
  });
});