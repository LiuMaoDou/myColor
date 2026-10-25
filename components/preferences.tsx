"use client";
import type { Preferences } from "@/lib/client";
import { Field, FieldLabel, FieldGroup } from "./ui/field";
export function PreferencesPanel({
  value,
  onChange,
}: {
  value: Preferences;
  onChange: (v: Preferences) => void;
}) {
  return (
    <section>
      <div className="section-heading">
        <div>
          <h1>偏好设置</h1>
          <p>让收藏与复制更顺手。设置只保存在当前浏览器。</p>
        </div>
      </div>
      <div className="editor-panel settings-panel">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="preferred-format">
              默认显示 / 复制格式
            </FieldLabel>
            <select
              id="preferred-format"
              value={value.format}
              onChange={(e) =>
                onChange({
                  ...value,
                  format: e.target.value as Preferences["format"],
                })
              }
            >
              <option value="auto">自动（保留透明度）</option>
              <option value="hex">HEX / HEX8</option>
              <option value="rgb">RGB</option>
              <option value="hsl">HSL</option>
              <option value="original">原始输入</option>
            </select>
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={value.lowercase}
              onChange={(e) =>
                onChange({ ...value, lowercase: e.target.checked })
              }
            />
            HEX 使用小写字母
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={value.hash}
              onChange={(e) => onChange({ ...value, hash: e.target.checked })}
            />
            HEX 保留 # 前缀
          </label>
          <Field>
            <FieldLabel htmlFor="theme">界面主题</FieldLabel>
            <select
              id="theme"
              value={value.theme}
              onChange={(e) =>
                onChange({
                  ...value,
                  theme: e.target.value as Preferences["theme"],
                })
              }
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="density">卡片密度</FieldLabel>
            <select
              id="density"
              value={value.density}
              onChange={(e) =>
                onChange({
                  ...value,
                  density: e.target.value as Preferences["density"],
                })
              }
            >
              <option value="comfortable">舒适</option>
              <option value="compact">紧凑</option>
            </select>
          </Field>
          <p className="muted">主题只改变界面外壳，不会修改收藏颜色的值。</p>
        </FieldGroup>
      </div>
    </section>
  );
}
