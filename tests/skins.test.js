import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSkin, withDefaults, TOKENS } from '../src/skins/schema.js';
import radar from '../src/skins/radar.js';
import paper from '../src/skins/paper.js';
import classic from '../src/skins/classic.js';
import template from '../src/skins/_template.js';

test('内置皮肤和模板都符合规范', () => {
  for (const skin of [radar, paper, classic, template]) {
    const { errors } = validateSkin(skin);
    assert.deepEqual(errors, [], `${skin.id}: ${errors.join('; ')}`);
    assert.equal(Object.keys(skin.tokens).length, TOKENS.length);
  }
});

test('缺少变量、非法取值和外部资源会被拒绝', () => {
  const broken = JSON.parse(JSON.stringify(radar));
  delete broken.tokens.accent;
  broken.tokens['grid-gap'] = '2em';
  broken.tokens.surface = 'url(http://evil.example/x.png)';
  broken.icons.hit = 'BOOM';
  broken.extraCss = '@import url(http://evil.example/a.css);';
  const { errors } = validateSkin(broken);
  assert.ok(errors.some((e) => e.includes('tokens.accent')));
  assert.ok(errors.some((e) => e.includes('grid-gap')));
  assert.ok(errors.some((e) => e.includes('tokens.surface')));
  assert.ok(errors.some((e) => e.includes('icons.hit')));
  assert.ok(errors.some((e) => e.includes('extraCss')));
});

test('未填写的图标和特效使用默认值', () => {
  const skin = withDefaults({ ...classic, icons: {}, effects: {} });
  assert.equal(skin.icons.hit, '✕');
  assert.equal(skin.effects.pulse, true);
  assert.equal(skin.effects.glow, false);
});
