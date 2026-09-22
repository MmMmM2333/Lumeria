export type IconBadge = Readonly<{ admin: boolean; missing: "question" | "prohibited" | "none" }>;
export type IconBadges = Readonly<Record<string, IconBadge>>;
