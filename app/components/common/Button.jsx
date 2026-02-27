export default function Button({ 
  children, 
  variant = 'primary', 
  onClick, 
  type = 'button',
  disabled = false,
  className = '',
  icon 
}) {
  const baseClass = 'px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base rounded-lg font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-aa-orange text-white hover:bg-[#e56000] hover:shadow-lg',
    secondary: 'bg-white text-aa-dark-blue border-2 border-aa-dark-blue hover:bg-aa-dark-blue hover:text-white',
    outline: 'bg-transparent text-aa-orange border-2 border-aa-orange hover:bg-aa-orange hover:text-white',
    ghost: 'bg-transparent text-aa-gray hover:bg-gray-100',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${variants[variant]} ${className}`}
      data-testid="button"
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
}
