import assert from "node:assert/strict";
import { CanvasTextMetrics } from "pixi.js";
import { createNativeParagraph } from "./nativeParagraph.js";

export function runNativeParagraphTests():void{
  for(const message of [
    "已将 4 个应用从启动台移除。",
    "将从启动台移除所选的 4 个应用，不会卸载应用或删除文件。",
    "“Tools for Windows Store Apps”已从启动台移除。",
    "文件夹中的应用将按当前顺序移回桌面。",
    "未能将所选应用加入排除列表，当前未移除任何应用。",
    "The selected apps could not be added to the exclusion list. No apps have been removed at this point.",
    "已移除并排除 2 个应用。可在设置的“已排除的应用”中将这些应用移出排除列表。",
    "Mixed 👨‍👩‍👧‍👦 emoji and 中文标点，不能落在行首。",
    // Generic long prose keeps wrapping coverage independent of product copy length.
    "已将 4 段包含 English words 的示例文本放入排版区域。请检查换行后的文字是否完整，以及逗号、句号和右引号是否紧随前面的文字。",
  ]){
    for(const width of [240,320,400]){
      const label=createNativeParagraph(message,{fontFamily:"Microsoft YaHei UI",fontSize:13},width);
      const lines=label.text.split("\n");
      assert.equal(lines.join("").replace(/\s/gu,""),message.replace(/\s/gu,""));
      for(const line of lines){
        assert.ok(CanvasTextMetrics.measureText(line,label.style).width<=width+0.01);
        assert.ok(!/^[，。！？；：、）》】」』”’]/u.test(line),line);
      }
      assert.ok(!lines.some(line=>/^已将 4$/u.test(line)),"Chinese text must fill the remaining line after the count");
      if(message.includes("👨‍👩‍👧‍👦"))assert.ok(lines.some(line=>line.includes("👨‍👩‍👧‍👦")));
      label.destroy();
    }
  }
}
