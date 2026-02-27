export default function Card({ children, className = '', onClick, hover = false }) {
  return (
    <div 
      className={`bg-white rounded-xl p-4 sm:p-6 shadow-sm ${hover ? 'hover:shadow-md cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      data-testid="card"
    >
      {children}
    </div>
  );
}
