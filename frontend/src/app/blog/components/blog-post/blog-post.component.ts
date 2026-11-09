import { Component, type OnInit, ViewEncapsulation, inject } from '@angular/core';
// biome-ignore lint/style/useImportType: <explanation>
import { ActivatedRoute } from '@angular/router';
// biome-ignore lint/style/useImportType: <explanation>
import { BlogService } from '../../services/blog.service';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { SeoService } from '../../../shared/seo';
import { postSeo } from './blog-post.seo';

@Component({
  selector: 'app-blog-post',
  templateUrl: './blog-post.component.html',
  styleUrls: ['./blog-post.component.css'],
  imports: [CommonModule],
  encapsulation: ViewEncapsulation.None
})
export class BlogPostComponent implements OnInit {
  post$!: Observable<string>;

  private route = inject(ActivatedRoute);
  private blogService = inject(BlogService);
  private seo = inject(SeoService);

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) {
      console.error('Slug parameter is missing');
      return;
    }

    this.post$ = this.blogService.getPost(slug).pipe(tap(html => this.seo.update(postSeo(html, slug))));
  }
}
