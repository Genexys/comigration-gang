import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddPinModal } from "./AddPinModal";

// Turnstile не нужен в тестах
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: () => null,
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  existingNicknames: [],
};

describe("AddPinModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рендерится когда open=true", () => {
    render(<AddPinModal {...defaultProps} />);
    expect(screen.getByText("Отметься на карте")).toBeInTheDocument();
  });

  it("не рендерится когда open=false", () => {
    render(<AddPinModal {...defaultProps} open={false} />);
    expect(screen.queryByText("Отметься на карте")).not.toBeInTheDocument();
  });

  it("блокирует отправку без ника (< 2 символов)", async () => {
    render(<AddPinModal {...defaultProps} />);
    const submitBtn = screen.getByText(/поставить/i);
    await userEvent.click(submitBtn);
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("блокирует отправку без согласия с политикой", async () => {
    render(<AddPinModal {...defaultProps} />);
    const nickInput = screen.getByPlaceholderText("Твой ник");
    await userEvent.type(nickInput, "Тестер");
    const submitBtn = screen.getByText(/поставить/i);
    await userEvent.click(submitBtn);
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("отправляет форму при корректных данных и согласии", async () => {
    render(<AddPinModal {...defaultProps} />);
    const nickInput = screen.getByPlaceholderText("Твой ник");
    await userEvent.type(nickInput, "Тестер");

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    const submitBtn = screen.getByText(/поставить/i);
    await userEvent.click(submitBtn);

    expect(defaultProps.onSubmit).toHaveBeenCalledWith("Тестер", "", null);
  });

  it("показывает предупреждение если ник уже занят", async () => {
    render(
      <AddPinModal {...defaultProps} existingNicknames={["Тестер"]} />
    );
    const nickInput = screen.getByPlaceholderText("Твой ник");
    await userEvent.type(nickInput, "Тестер");
    expect(screen.getByText(/такой ник уже есть/i)).toBeInTheDocument();
  });

  it("не блокирует отправку даже если ник занят (только предупреждение)", async () => {
    render(
      <AddPinModal {...defaultProps} existingNicknames={["Тестер"]} />
    );
    const nickInput = screen.getByPlaceholderText("Твой ник");
    await userEvent.type(nickInput, "Тестер");

    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);

    await userEvent.click(screen.getByText(/поставить/i));
    expect(defaultProps.onSubmit).toHaveBeenCalled();
  });

  it("вызывает onClose при клике Отмена", async () => {
    render(<AddPinModal {...defaultProps} />);
    await userEvent.click(screen.getByText("Отмена"));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("сбрасывает форму при переоткрытии", async () => {
    const { rerender } = render(<AddPinModal {...defaultProps} />);
    const nickInput = screen.getByPlaceholderText("Твой ник");
    await userEvent.type(nickInput, "Тестер");

    rerender(<AddPinModal {...defaultProps} open={false} />);
    rerender(<AddPinModal {...defaultProps} open={true} />);

    expect(screen.getByPlaceholderText("Твой ник")).toHaveValue("");
  });

  it("ссылка на политику конфиденциальности ведёт на /privacy", () => {
    render(<AddPinModal {...defaultProps} />);
    const link = screen.getByRole("link", { name: /политикой конфиденциальности/i });
    expect(link).toHaveAttribute("href", "/privacy");
  });
});
