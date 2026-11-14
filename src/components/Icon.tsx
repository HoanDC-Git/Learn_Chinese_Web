// Icon Material Symbols Rounded (Google Fonts), tải về local, bundle thẳng
// vào JS nên offline vẫn hiển thị — thay toàn bộ emoji ký hiệu (☁ ✕ ↩ ✓ 📚).
import closeSvg from '../assets/icons/close.svg?raw';
import undoSvg from '../assets/icons/undo.svg?raw';
import cloudUploadSvg from '../assets/icons/cloud_upload.svg?raw';
import cloudDoneSvg from '../assets/icons/cloud_done.svg?raw';
import cloudOffSvg from '../assets/icons/cloud_off.svg?raw';
import syncSvg from '../assets/icons/sync.svg?raw';
import menuBookSvg from '../assets/icons/menu_book.svg?raw';
import checkSvg from '../assets/icons/check.svg?raw';
import volumeUpSvg from '../assets/icons/volume_up.svg?raw';

export type IconName =
  | 'close'
  | 'undo'
  | 'cloudUpload'
  | 'cloudDone'
  | 'cloudOff'
  | 'sync'
  | 'menuBook'
  | 'check'
  | 'volumeUp';

const MAP: Record<IconName, string> = {
  close: closeSvg,
  undo: undoSvg,
  cloudUpload: cloudUploadSvg,
  cloudDone: cloudDoneSvg,
  cloudOff: cloudOffSvg,
  sync: syncSvg,
  menuBook: menuBookSvg,
  check: checkSvg,
  volumeUp: volumeUpSvg,
};

export function Icon({
  name,
  size = 20,
  spin = false,
  label,
}: {
  name: IconName;
  size?: number;
  spin?: boolean;
  label?: string;
}) {
  return (
    <span
      className={'ic' + (spin ? ' spin' : '')}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: MAP[name] }}
    />
  );
}
