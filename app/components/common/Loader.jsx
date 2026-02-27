export default function Loader({ size = 'md', text = '' }) {
  const sizes = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-4',
    lg: 'w-16 h-16 border-4',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3" data-testid="loader">
      <div className={`${sizes[size]} border-gray-200 border-t-aa-orange rounded-full animate-spin`}></div>
      {text && <p className="text-aa-gray text-sm">{text}</p>}
    </div>
  );
}
