import { Component } from 'react';

/*
 * Contains any RPG render or lazy-load failure. The RPG layer is dropped and
 * the finance application carries on untouched.
 */
export default class RpgErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('[rpg] RPG closed after an error:', error);
    this.props.onFail?.();
  }

  componentDidUpdate(prevProps) {
    // A fresh activation gets a fresh attempt.
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
