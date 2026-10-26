// Build-only compatibility correction. The selected client checkout stays unchanged.
function patchWorldView(source) {
  const text = source.replace(/\r\n/g, '\n');
  const call = '    this.resetAllFormViewsIfPlayerChangedWorld();';
  const unsafe = `    const pc = this.sp.Game.getPlayer()!;
    const pcWorldOrCell = (
      (pc.getWorldSpace() || pc.getParentCell()) as Form
    ).getFormID();`;
  const end = `      state.pcWorldOrCell = pcWorldOrCell;
    }
  }`;
  for (const expected of [call, unsafe, end]) {
    if (text.split(expected).length !== 2) throw new Error('WorldView source changed; review the compatibility correction before rebuilding.');
  }
  return text
    .replace(call, '    if (!this.resetAllFormViewsIfPlayerChangedWorld()) return;')
    .replace(unsafe, `    const pc = this.sp.Game.getPlayer();
    const worldOrCell = pc?.getWorldSpace() || pc?.getParentCell();
    if (!worldOrCell) return false;
    const pcWorldOrCell = worldOrCell.getFormID();`)
    .replace(end, `      state.pcWorldOrCell = pcWorldOrCell;
    }
    return true;
  }`);
}
module.exports = function(source) { return patchWorldView(source); };
module.exports.patchWorldView = patchWorldView;
