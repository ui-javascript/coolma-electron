import type { IpcResult } from '../shared/ipc/contract';
import { vueSfcParseSchema } from '../shared/ipc/schemas';
import { failFromError } from './controller-utils';
import { ok } from '../shared/ipc/result';
import { parseVueSfc, type VueSfcCompileResult } from '../service/vue-sfc-compiler';

/** 微应用桥专用的主进程能力：Vue 2 SFC 编译。 */
class MicroAppController {
  async parse(args?: unknown): Promise<IpcResult<VueSfcCompileResult>> {
    try {
      const input = vueSfcParseSchema.parse(args ?? {});
      const source = typeof input === 'string' ? input : input.source;
      const options = typeof input === 'string' ? {} : (input.options ?? {});
      return ok(await parseVueSfc(source, options));
    } catch (error) {
      return failFromError(error, (error as { code?: string })?.code || 'VUE_SFC_PARSE_FAILED');
    }
  }
}

MicroAppController.toString = () => '[class MicroAppController]';

export default MicroAppController;
