import { AbsoluteUrlMapper } from './mapper';
import { dataUrlMapper } from './dataurlmapper';
import { relativeToOpenFileUrlMapper } from './relativetoopenfilemapper';
import { relativeToWorkspaceRootFileUrlMapper } from './relativetoworkspacerootmapper';
import { simpleUrlMapper } from './simplemapper';

export const absoluteUrlMappers: AbsoluteUrlMapper[] = [
    dataUrlMapper,
    simpleUrlMapper,
    relativeToOpenFileUrlMapper,
    relativeToWorkspaceRootFileUrlMapper,
];
