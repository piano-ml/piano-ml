export * from './account.service';
import { AccountService } from './account.service';
export * from './author.service';
import { AuthorService } from './author.service';
export * from './score.service';
import { ScoreService } from './score.service';
export const APIS = [AccountService, AuthorService, ScoreService];
