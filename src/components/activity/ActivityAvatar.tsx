import { Globe } from 'lucide-react';

interface ActorAvatarProps {
  name: string;
  avatarUrl: string;
}

interface SystemAvatarProps {
  system: true;
}

type ActivityAvatarProps = ActorAvatarProps | SystemAvatarProps;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0).toUpperCase() ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0).toUpperCase() : '';
  return first + last || '?';
}

export function ActivityAvatar(props: ActivityAvatarProps) {
  if ('system' in props) {
    return (
      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
        <Globe size={20} className="text-primary" />
      </div>
    );
  }

  const { name, avatarUrl } = props;

  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name}
      className="w-10 h-10 rounded-full object-cover shrink-0"
    />
  ) : (
    <span className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold text-sm inline-flex items-center justify-center shrink-0 select-none">
      {getInitials(name)}
    </span>
  );
}
