import { displayContactName } from "@/lib/format";
import type { ConversationListItem } from "@/types/domain";

type AvatarSize = "sm" | "md";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-sm",
};

export function ContactAvatar({
  conversation,
  size = "sm",
}: {
  conversation: ConversationListItem;
  size?: AvatarSize;
}) {
  const label = displayContactName(conversation.contactName, conversation.contactJid);
  const initial = label.trim().charAt(0).toUpperCase() || "#";

  return (
    <span
      className={`${sizeClasses[size]} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted font-black text-muted`}
      aria-hidden="true"
    >
      <span>{initial}</span>
      {conversation.profilePictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={conversation.profilePictureUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.remove();
          }}
        />
      ) : null}
    </span>
  );
}
