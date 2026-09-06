import { nativeFluentTheme, type NativeTheme } from "../NativeFluentButton.js";

export const nativeUiMetrics=Object.freeze({sectionGap:16,headingGap:12,disclosurePadding:14,scrollbarWidth:4,scrollbarInset:4});

/** Semantic control colors preserve RGBA and distinguish switch from checkbox. */
export function nativeUiTheme(theme:NativeTheme){
  const fluent=nativeFluentTheme(theme),dark=theme==="dark";
  return {
    disclosure:dark?"rgba(255,255,255,0.026)":fluent.colorNeutralBackground3,
    separator:dark?"rgba(255,255,255,0.055)":fluent.colorNeutralStroke2,
    option:dark?"rgba(0,0,0,0.1)":fluent.colorNeutralBackground1,
    optionSelected:dark?"rgba(75,163,246,0.16)":fluent.colorBrandBackground2,
    input:dark?"rgba(0,0,0,0.16)":fluent.colorNeutralBackground1,
    inputBorder:dark?"rgba(255,255,255,0.14)":fluent.colorNeutralStroke1,
    inputBottom:dark?"rgba(255,255,255,0.34)":fluent.colorNeutralStrokeAccessible,
    switchOn:fluent.colorCompoundBrandBackground,
    switchOnHover:fluent.colorCompoundBrandBackgroundHover,
    switchOnPressed:fluent.colorCompoundBrandBackgroundPressed,
    switchThumb:fluent.colorNeutralForegroundInverted,
    switchOffThumb:fluent.colorNeutralStrokeAccessible,
    switchOff:"transparent",
  };
}
