import { create } from "zustand";

interface UiState {
  isLoading: boolean;
  loadingMessage: string;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  isLoading: false,
  loadingMessage: "",
  startLoading: (message = "Loading...") => set({ isLoading: true, loadingMessage: message }),
  stopLoading: () => set({ isLoading: false, loadingMessage: "" }),
}));
