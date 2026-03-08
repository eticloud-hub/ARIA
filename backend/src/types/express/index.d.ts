import { RequestContext } from '../../shared/types';

declare global {
    namespace Express {
        interface Request {
            ctx: RequestContext;
            requestId: string;
        }
    }
}
