import Swal, { type SweetAlertOptions, type SweetAlertResult } from 'sweetalert2';
import { inject } from 'vue';

export function useNotify() {
    const container = inject<HTMLElement | null>('shadowRootContainer', null);

    const withTarget = (options: SweetAlertOptions): SweetAlertOptions => ({
        ...options,
        target: container ?? document.body,
    });

    const fire = (options: SweetAlertOptions): Promise<SweetAlertResult> => Swal.fire(withTarget(options));

    return {
        fire,
        close: () => Swal.close(),
        showLoading: () => Swal.showLoading(),
    };
}
