export default function Card({
  children,
  className = '',
  onClick,
  hover = false,
  unstyled = false,
}) {
  const baseClass = unstyled ? '' : 'bg-white rounded-xl p-4 sm:p-6 shadow-sm';
  return (
    <div
      className={`${baseClass} ${hover ? 'hover:shadow-md cursor-pointer' : ''} ${className}`.trim()}
      onClick={onClick}
      data-testid="card"
    >
      {children}
    </div>
  );
}
