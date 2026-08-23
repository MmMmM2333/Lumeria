export type TupleAppSeed = readonly [name: string, emoji: string];
export type ObjectAppSeed = Readonly<{
  id: string;
  type: "app";
  name: string;
  emoji: string;
}>;
export type FolderAppSeed = Readonly<{
  id: string;
  type: "folder";
  name: string;
  emoji: string;
  childPages: readonly (readonly ObjectAppSeed[])[];
}>;
export type AppSeed = TupleAppSeed | FolderAppSeed;

const defaultApps: TupleAppSeed[] = [
  ["Safari", "🧭"], ["Mail", "✉️"], ["Photos", "🌄"], ["Music", "🎵"], ["Calendar", "📅"], ["Maps", "🗺️"], ["Messages", "💬"],
  ["Notes", "📝"], ["Reminders", "✅"], ["FaceTime", "📹"], ["Weather", "☀️"], ["Clock", "⏰"], ["Books", "📚"], ["TV", "📺"],
  ["Podcasts", "🎙️"], ["Files", "📁"], ["Keynote", "📊"], ["Numbers", "🔢"], ["Pages", "📄"], ["Terminal", "⌨️"], ["Xcode", "🛠️"],
  ["Figma", "🎨"], ["Slack", "#️⃣"], ["Notion", "◼️"], ["Chrome", "🌐"], ["Spotify", "🟢"], ["GitHub", "🐙"], ["Docker", "🐳"],
  ["Linear", "📐"], ["Discord", "🎧"], ["Zoom", "🔎"], ["Preview", "👁️"], ["Contacts", "👤"],
];

const moreApps: TupleAppSeed[] = [
  ["Calculator", "🧮"], ["Voice Memos", "🎚️"], ["Freeform", "🧩"], ["Shortcuts", "⚡"], ["Health", "❤️"], ["Home", "🏠"], ["Find My", "📍"],
  ["Settings", "⚙️"], ["App Store", "🛍️"], ["TestFlight", "✈️"], ["Stocks", "📈"], ["Wallet", "💳"], ["Translate", "🌍"], ["Journal", "📓"],
  ["Magnifier", "🔍"], ["Activity Monitor", "📟"], ["Automator", "🤖"], ["Disk Utility", "💽"], ["Console", "📜"], ["Script Editor", "📜"], ["System Info", "ℹ️"],
  ["QuickTime", "🎬"], ["Photo Booth", "📸"], ["GarageBand", "🎹"], ["iMovie", "🎞️"], ["Compressor", "🗜️"], ["Logic Pro", "🎛️"], ["Final Cut", "✂️"],
  ["Pixelmator", "🖼️"], ["Blender", "🧊"], ["Cinema 4D", "🎥"], ["Unity", "🧱"], ["Unreal", "🕹️"], ["Godot", "🤿"], ["VS Code", "💻"],
  ["WebStorm", "🕸️"], ["DataGrip", "🗄️"], ["Postman", "📮"], ["TablePlus", "🧾"], ["Raycast", "🚀"], ["Arc", "🌈"], ["Firefox", "🦊"],
  ["Edge", "🌊"], ["Brave", "🦁"], ["Teams", "👥"], ["Telegram", "✈️"], ["WhatsApp", "☎️"], ["WeChat", "💚"], ["Obsidian", "🪨"],
  ["Bear", "🐻"], ["Things", "☑️"], ["Todoist", "📌"], ["Trello", "📋"], ["Asana", "🧭"], ["Jira", "🎫"], ["Confluence", "📚"],
  ["Dropbox", "📦"], ["OneDrive", "☁️"], ["Google Drive", "📁"], ["iCloud Drive", "☁️"], ["Transmit", "📡"], ["Cyberduck", "🦆"], ["Fork", "🌿"],
];

const productivityIcons = ["📄", "📊", "📈", "📋", "🧾", "🗂️", "📌", "✅", "🗓️", "📝", "🔖", "📎", "🧮", "📚", "📇", "🗃️", "📦", "🧭", "🔍", "✏️"];
const creativeIcons = ["🎨", "🖌️", "🖼️", "📸", "🎞️", "🎬", "🎧", "🎹", "🎛️", "🎚️", "🎙️", "🧊", "🧱", "✂️", "📐", "🌈", "✨"];

function appSeed(
  idPrefix: string,
  namePrefix: string,
  emojiList: readonly string[],
  index: number,
): ObjectAppSeed {
  const number = String(index + 1).padStart(2, "0");
  const emoji = emojiList[index % emojiList.length];
  if (emoji === undefined) throw new TypeError("appSeed requires at least one emoji");
  return {
    id: `${idPrefix}-${number}`,
    type: "app",
    name: `${namePrefix} ${number}`,
    emoji,
  };
}

function makeFullFolderPages() {
  return Array.from({ length: 3 }, (_, pageIndex) =>
    Array.from({ length: 35 }, (_, itemIndex) => appSeed("prod-tool", "Productivity", productivityIcons, pageIndex * 35 + itemIndex))
  );
}

function makePartialFolderPages() {
  return [18, 12, 24].map((count, pageIndex) =>
    Array.from({ length: count }, (_, itemIndex) => appSeed("creative-tool", "Creative", creativeIcons, pageIndex * 35 + itemIndex))
  );
}

export const appSeeds: readonly AppSeed[] = [
  ...defaultApps,
  {
    id: "folder-productivity-suite",
    type: "folder",
    name: "Productivity Suite",
    emoji: "📁",
    childPages: makeFullFolderPages(),
  },
  {
    id: "folder-creative-lab",
    type: "folder",
    name: "Creative Lab",
    emoji: "🎨",
    childPages: makePartialFolderPages(),
  },
  ...moreApps,
];
