import type { Container,Sprite,Text } from "pixi.js";

// Shape of a rendered desktop icon node. Kept with the presentation helpers so
// scene walking code and diagnostic captures agree on the same structure.
export type NativeIconNode = Container & Readonly<{
  emojiText: Text;
  iconSprite: Sprite;
  labelText: Text;
}>;
