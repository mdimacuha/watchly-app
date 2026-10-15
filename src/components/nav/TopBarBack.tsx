'use client';

import { motion } from 'framer-motion';
import { useAuthStore } from '@/client/stores/auth';
import { BackButton } from './BackButton';
import { UserAvatar } from '@/components/ui/user-avatar';

export function TopBarBack() {
  const user = useAuthStore((s) => s.user);

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-border/50 bg-background/80 backdrop-blur-md"
    >
      <BackButton />
      <UserAvatar
        avatarUrl={user?.avatarUrl}
        firstName={user?.firstName}
        lastName={user?.lastName}
        size="md"
        href="/me"
      />
    </motion.header>
  );
}
