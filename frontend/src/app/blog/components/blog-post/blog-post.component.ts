import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { BlogService } from '../../services/blog.service';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-blog-post',
  templateUrl: './blog-post.component.html',
  styleUrls: ['./blog-post.component.css'],
  imports: [    CommonModule, ],
    encapsulation: ViewEncapsulation.None
})
export class BlogPostComponent implements OnInit {
  post$!: Observable<string>;

  constructor(
    private route: ActivatedRoute,
    private blogService: BlogService,
    private titleService: Title
  ) { }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (slug) {
      this.post$ = this.blogService.getPost(slug).pipe(
        tap(html => {
          const title = this.extractTitle(html);
          if (title) {
            this.titleService.setTitle(title);
          }
        })
      );
    } else {
      console.error('Slug parameter is missing');
    }
  }

  private extractTitle(html: string): string | null {
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (!h1Match) return null;
    
    const h1Content = h1Match[1];
    
    // Try to extract text content first
    const textContent = h1Content.replace(/<[^>]*>/g, '').trim();
    if (textContent) return textContent;
    
    // If no text, try to extract img alt attribute
    const imgAltMatch = h1Content.match(/<img[^>]+alt=["']([^"']+)["']/i);
    return imgAltMatch ? imgAltMatch[1] : null;
  }
}
