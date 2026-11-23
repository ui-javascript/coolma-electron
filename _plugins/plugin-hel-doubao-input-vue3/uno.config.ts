import { resolve } from "node:path";
import { FileSystemIconLoader } from "@iconify/utils/lib/loader/node-loaders";
import { presetIcons } from "@unocss/preset-icons";
import {
  defineConfig,
  presetAttributify,
  presetUno,
  transformerDirectives,
} from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      // 图标集合配置
      collections: {
        // 使用已安装的图标集
        ion: () =>
          import("@iconify-json/ion/icons.json").then((i) => i.default),
        mdi: () =>
          import("@iconify-json/mdi/icons.json").then((i) => i.default),
        // 自定义图标集合
        custom: FileSystemIconLoader(
          resolve(process.cwd(), "src/assets/svg"),
        ),
      },
      // 图标样式
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
      scale: 1,
      // i-{collection}-{icon}
      prefix: "i-",
    }),
  ],
  transformers: [transformerDirectives()],
  // 定义组合
  shortcuts: {
    // 定义单个样式组合
    // 宽高100%
    "wh-full": "w-full h-full",
    // 一行显示
    "text-truncate":
      "overflow-hidden text-ellipsis whitespace-nowrap break-words",
    // 居中
    "flex-center": "flex items-center justify-center",
  },

  // 定义自定义规则
  rules: [],
});
