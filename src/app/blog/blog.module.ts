import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { BlogRoutingModule } from './blog-routing.module';
import { BlogComponent } from './components/blog/blog.component';
import { BlogPostComponent } from './components/blog-post/blog-post.component';

@NgModule({
  declarations: [BlogComponent, BlogPostComponent],
  imports: [
    CommonModule,
    BlogRoutingModule,
    HttpClientModule
  ]
})
export class BlogModule { }
