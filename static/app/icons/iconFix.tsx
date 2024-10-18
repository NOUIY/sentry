import {forwardRef} from 'react';

import type {SVGIconProps} from './svgIcon';
import {SvgIcon} from './svgIcon';

const IconFix = forwardRef<SVGSVGElement, SVGIconProps>((props, ref) => {
  return (
    <SvgIcon {...props} ref={ref}>
      <path d="M2.68,15.95c-.67,0-1.34-.25-1.86-.76,0,0,0,0,0,0-1.03-1.03-1.03-2.7,0-3.72l4.89-4.89-.02-.05c-.79-1.94-.5-3.96.79-5.25C7.85-.1,10.89-.29,12.7.45c.23.1.4.3.45.55.05.25-.03.5-.21.68l-2.4,2.4-.02,1.41,1.4-.02,2.41-2.41c.18-.18.43-.25.68-.21.25.05.45.22.55.45.74,1.81.54,4.85-.82,6.22-1.29,1.29-3.31,1.58-5.28.78h-.02c-1.15,1.14-4.89,4.88-4.89,4.88-.51.51-1.19.77-1.86.77ZM1.88,14.12c.44.44,1.16.44,1.6,0q5.58-5.58,6.04-5.39l.47.17c1.43.58,2.82.41,3.67-.44.63-.63.93-2.1.78-3.4l-1.68,1.68c-.14.14-.32.22-.52.22l-2.42.04c-.24.03-.49-.07-.66-.27-.13-.15-.19-.34-.17-.53l.04-2.45c0-.19.08-.38.22-.52l1.68-1.68c-1.3-.15-2.77.15-3.4.78-.85.85-1.02,2.25-.45,3.65l.19.53c.1.27.03.58-.17.79L1.88,12.51c-.44.44-.44,1.16,0,1.6Z" />
    </SvgIcon>
  );
});

IconFix.displayName = 'IconFix';

export {IconFix};
