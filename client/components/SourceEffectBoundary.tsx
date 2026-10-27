/* Keep an unsupported finishing effect recoverable without losing the drawing or reloading. */
import { Component, type ReactNode } from 'react';
import type { Params } from '../../shared/params';
import type { Traits } from '../../shared/traits';
import { SourceEffectError, sourceEffectMessage } from '../../shared/source/effect-error';
import { download } from '../lib/api';
import { actions, designFile, useEditor } from '../state/editor';

export function SourceEffectBoundary({ children }: { children: ReactNode }) {
  const params = useEditor(s => s.params), traits = useEditor(s => s.traits);
  return <EffectBoundary params={params} traits={traits}>{children}</EffectBoundary>;
}

interface EffectInputs { params: Params; traits: Traits }
class EffectBoundary extends Component<EffectInputs & { children: ReactNode }, EffectInputs & { error: SourceEffectError | null }> {
  state: EffectInputs & { error: SourceEffectError | null } = { params: this.props.params, traits: this.props.traits, error: null };
  static getDerivedStateFromProps(props: EffectInputs, state: EffectInputs) {
    return props.params === state.params && props.traits === state.traits ? null : { params: props.params, traits: props.traits, error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    if (!(error instanceof SourceEffectError)) throw error;
    return { error };
  }
  render() {
    return this.state.error ? <EffectRecovery error={this.state.error} /> : this.props.children;
  }
}

function EffectRecovery({ error }: { error: SourceEffectError }) {
  const canUndo = useEditor(s => s.hi > 0);
  const keep = () => {
    const { file, blob } = designFile(useEditor.getState());
    download(file, blob);
  };
  const solid = () => {
    actions.setTrait('fill', null);
    actions.setOption('fill', 'solid');
  };
  const texture = error.effect === 'texture';
  return <div className="message-page" role="alert">
    <h1>This effect needs an adjustment</h1>
    <p>{sourceEffectMessage(error)} Your point edits are still here.</p>
    <div className="row">
      <button className="btn primary" onClick={texture ? actions.clearSourceTexture : solid}>{texture ? 'Turn off texture' : 'Use Solid fill'}</button>
      <button className="btn outline" disabled={!canUndo} onClick={() => actions.travel(-1)}>Undo last change</button>
      <button className="btn outline" onClick={keep}>Save design file</button>
    </div>
  </div>;
}
