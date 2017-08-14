var RSS = require('rss');
var fs = require('fs');
var axios = require('axios');
var _ = {
  get: require('lodash.get')
};
var { exec } = require('child_process')

var RSS_ALL_TYPE = 'rss-all';
var RSS_TYPE = 'rss';

var type = process.argv[2];

console.log('type', type)

var apiURL = 'https://go-api.twreporter.org/v1';

var getter = axios.create({
  baseURL: apiURL,
  timeout: 3000
});

var offset = 0;
var limit = 50;
var sort = '-publishedDate';

getter.get('/posts',{
  method: 'get',
  params: {
    offset: offset,
    limit: limit,
    sort: sort
  }
}).then(function(response) {
  var total = _.get(response, 'data.meta.total', 0);
  var records = _.get(response, 'data.records', []);
  var promises = [];

  if (total > 0 && type === RSS_ALL_TYPE) {
    var times = Math.ceil((total-limit) / limit)
    for (var i = 1; i <= times; i++) {
      promises.push(i)
    }

    return promises.reduce(function(cur, next) {
      return cur.then(function() {
        return getter.get('/posts', {
          method: 'get',
          params: {
            offset: next * limit,
            limit: limit,
            sort: sort
          }
        }).then(function(response) {
          records = records.concat(_.get(response, 'data.records', []))
        })
      });
    }, Promise.resolve()).then(function() {
      return records
    });
  }

  return records;
}).then(function(records) {
  var feed = new RSS({
    title: '報導者',
    site_url: 'https://www.twreporter.org/',
    feed_url: 'https://www.twreporter.org/a/rss2.xml',
    description: '報導者－深入挖掘新聞',
    language: 'zh-TW',
    copyright: 'CC BY-NC-ND 3.0',
    image_url: 'https://www.twreporter.org/asset/favicon.png'
  });

  records.forEach(function(record) {
    if (typeof record === 'object') {
      var style = _.get(record, 'style')
      var slug = _.get(record, 'slug')
      feed.item({
        title: _.get(record, 'title'),
        description: _.get(record, 'og_description'),
        url: `https://www.twreporter.org/${style === 'interactive' ? 'i' : 'a'}/slug`,
        enclosure: {
          url: _.get(record, 'hero_image.resized_targets.mobile.url'),
          type: _.get(record, 'hero_image.filetype', 'image/jpeg')
        },
        date: _.get(record, 'published_date')
      })
    }
  })

  return feed
}).then(function(feed) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(`/tmp/twreporter/articles/${type}.xml`, feed.xml(), 'utf8', function(error) {
      if (error) {
        console.log('Error:', error.toString())
        reject(error)
        return
      }
      resolve()
    })
  })
}).then(function() {
  return new Promise(function(resolve, reject) {
    var command = `gsutil -h "Content-Type:application/rss+xml" -h "Cache-Control:max-age=1800,public" \
      -h "Content-Language:zh" -h "Content-Encoding: utf8" \
      cp -a public-read /tmp/twreporter/articles/${type}.xml gs://twreporter-article.twreporter.org/`
    exec(command, function(error, stdout, stderr) {
      if (error) {
        console.error(`upload file error: ${error}`);
        reject(error)
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.log(`stderr: ${stderr}`);
      resolve()
    })
  })

}).catch(function(error) {
  console.log('Error:', error.toString())
})
