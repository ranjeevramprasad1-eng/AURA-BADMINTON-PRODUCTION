import { BottomNav } from '@/components/navigation/BottomNav';

export default function MainLayout({ children }) {
  return (
    <div className="max-w-[500px] border-r border-l mx-auto min-h-svh bg-gray-50">
      {children}
      <BottomNav />
    </div>
  );
}

