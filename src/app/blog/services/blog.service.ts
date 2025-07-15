import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { marked } from 'marked';

@Injectable({
  providedIn: 'root'
})
export class BlogService {

  constructor(private http: HttpClient) { }

  getPost(slug: string): Observable<string> {
    return this.http.get(`assets/blog/${slug}.md`, { responseType: 'text' })
      .pipe(map(markdown => marked(markdown)));
  }
}
