/* Keep an unsupported finishing effect recoverable without losing the drawing or reloading. */
import { Component, type ReactNode } from 'react';
import type { Params } from '../../shared/params';
import { SourceEffectError, sourceEffectMessage } from '../../shared/source/effect-error';
import { download } from '../lib/api';
import { actions, designFile, useEditor } from '../state/editor';

export function SourceEffectBoundary({ children }: { children: ReactNode }) {
  const params = useEditor(s => s.params);
  return <EffectBoundary params={params}>{children}</EffectBoundary>;
}

class EffectBoundary extends Component<{ params: Params; children: ReactNode }, { params: Params; error: SourceEffectError | null }> {
  state: { params: Params; error: SourceEffectError | null } = { params: this.props.params, error: null };
  static getDerivedStateFromProps(props: { params: Params }, state: { params: Params }) {
    return props.params === state.params ? null : { params: props.params, error: null };
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
  return <div className="message-page" role="alert">
    <h1>This fill needs an adjustment</h1>
    <p>{sourceEffectMessage(error)} Your point edits are still here.</p>
    <div className="row">
      <button className="btn primary" onClick={solid}>Use Solid fill</button>
      <button className="btn outline" disabled={!canUndo} onClick={() => actions.travel(-1)}>Undo last change</button>
      <button className="btn outline" onClick={keep}>Save design file</button>
    </div>
  </div>;
}
