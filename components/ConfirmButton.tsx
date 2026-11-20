"use client";

export default function ConfirmButton({
  message,
  children,
  className = "btn sm danger",
  name,
  value,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      name={name}
      value={value}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
