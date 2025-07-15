import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BlogService } from '../../services/blog.service';
import { Observable } from 'rxjs';
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
    private blogService: BlogService
  ) { }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (slug) {
      this.post$ = this.blogService.getPost(slug);
    } else {
      console.error('Slug parameter is missing');
    }
  }
}
