/** busDialog 的默认注册表（应用启动调用一次，幂等）。 */
import { registerBusDialog, startBusDialogs, getBusDialog } from '@/services/busDialog';

let installed = false;

export function installBusDialogs(): void {
  if (installed) {
    return;
  }
  installed = true;
  if (!getBusDialog('AiHelperBusDialog')) {
    registerBusDialog(
      'AiHelperBusDialog',
      () => import('@/components/AiHelperBusDialog.vue'),
      { kind: 'drawer', props: { size: '420px', title: 'AI 助手' } },
    );
  }
  startBusDialogs();
}
